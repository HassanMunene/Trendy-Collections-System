<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\StockMovement;
use App\Services\StockLedger;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use Tests\TestCase;

/** The database itself must protect stock history, not only the application code. */
class LedgerIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_refuses_to_edit_or_delete_a_movement(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner));
        $id = StockMovement::where('roll_id', $roll->id)->value('id');

        $this->assertDbRefuses(fn () => DB::table('stock_movements')->where('id', $id)->update(['change_cm' => 9999]));
        $this->assertDbRefuses(fn () => DB::table('stock_movements')->where('id', $id)->delete());
        $this->assertDbRefuses(fn () => DB::table('audit_events')->delete());
        $this->assertSame(5000, StockMovement::find($id)->change_cm);
    }

    public function test_model_refuses_to_edit_a_movement(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner));
        $movement = StockMovement::where('roll_id', $roll->id)->first();

        $this->expectException(LogicException::class);
        $movement->update(['note' => 'changed']);
    }

    public function test_balance_can_never_go_negative(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);
        $ledger = app(StockLedger::class);

        try {
            DB::transaction(fn () => $ledger->post($ledger->lockedRoll($roll->id), -5001, 'cut', $owner));
            $this->fail('Over-cutting was allowed');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('only has 50.00 m left', $e->getMessage());
        }

        $this->assertDbRefuses(fn () => DB::table('rolls')->where('id', $roll->id)->update(['balance_cm' => -1]));
        $this->assertSame(5000, $roll->fresh()->balance_cm);
    }

    public function test_ledger_cannot_be_used_outside_a_transaction(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);

        // RefreshDatabase wraps each test in a transaction, so step out of it to check the guard.
        $level = DB::transactionLevel();
        for ($i = 0; $i < $level; $i++) {
            DB::rollBack();
        }
        try {
            $this->expectException(LogicException::class);
            app(StockLedger::class)->post($roll, -100, 'cut', $owner);
        } finally {
            for ($i = 0; $i < $level; $i++) {
                DB::beginTransaction();
            }
        }
    }

    public function test_cached_balance_matches_ledger_after_several_changes(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);
        foreach ([4800, 4825, 100] as $count) {
            $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => $count, 'reason' => 'Count'])->assertCreated();
        }

        $roll->refresh();
        $this->assertSame(100, $roll->balance_cm);
        $this->assertSame(100, app(StockLedger::class)->ledgerBalance($roll));
        $this->assertGreaterThan(0, AuditEvent::count());
    }

    private function assertDbRefuses(callable $fn): void
    {
        DB::beginTransaction(); // savepoint, so the failed statement doesn't poison the test transaction
        try {
            $fn();
            $this->fail('The database accepted a forbidden change');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        } finally {
            DB::rollBack();
        }
    }
}
