<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Services\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_count_correction_records_before_after_and_movement(): void
    {
        $manager = $this->userWith(Role::Manager);
        $roll = $this->receivedRoll($manager);

        $this->spa()->actingAs($manager)->postJson("/api/rolls/{$roll->id}/adjustments", [
            'counted_cm' => 4800,
            'reason' => 'Measured at stocktake',
        ])->assertCreated()
            ->assertJsonPath('data.before_cm', 5000)
            ->assertJsonPath('data.after_cm', 4800);

        $roll->refresh();
        $this->assertSame(4800, $roll->balance_cm);
        $movement = StockMovement::where('roll_id', $roll->id)->where('kind', 'adjustment')->sole();
        $this->assertSame(-200, $movement->change_cm);
        $this->assertSame(4800, $movement->balance_after_cm);
        $this->assertSame('Measured at stocktake', $movement->note);
        $this->assertSame($roll->balance_cm, app(StockLedger::class)->ledgerBalance($roll));
    }

    public function test_correction_needs_a_reason_and_a_different_count(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);

        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 4800, 'reason' => '   '])
            ->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 5000, 'reason' => 'Recount'])
            ->assertStatus(422)->assertJsonValidationErrors('counted_cm');
        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => -1, 'reason' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors('counted_cm');

        $this->assertSame(0, StockAdjustment::count());
        $this->assertSame(5000, $roll->fresh()->balance_cm);
    }

    public function test_correction_to_zero_marks_roll_finished_and_back_to_active(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);

        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 0, 'reason' => 'Roll used up'])
            ->assertCreated();
        $this->assertSame('finished', $roll->fresh()->status);
        $this->spa()->actingAs($owner)->getJson('/api/rolls')->assertJsonCount(0, 'data');
        $this->spa()->actingAs($owner)->getJson('/api/rolls?status=finished')->assertJsonCount(1, 'data');

        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 150, 'reason' => 'Found piece at back'])
            ->assertCreated();
        $this->assertSame('active', $roll->fresh()->status);
    }

    public function test_only_owner_and_manager_can_correct_stock(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner));

        foreach ([Role::Cashier, Role::Cutter, Role::Tailor] as $role) {
            $this->spa()->actingAs($this->userWith($role))
                ->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 100, 'reason' => 'x'])
                ->assertForbidden();
        }
        $this->assertSame(5000, $roll->fresh()->balance_cm);
    }

    public function test_adjustment_history_is_listed_with_who_did_it(): void
    {
        $owner = $this->userWith(Role::Owner, ['name' => 'Mama Trendy']);
        $roll = $this->receivedRoll($owner);
        $this->spa()->actingAs($owner)->postJson("/api/rolls/{$roll->id}/adjustments", ['counted_cm' => 4900, 'reason' => 'Recount']);

        $this->spa()->actingAs($this->userWith(Role::Cashier))->getJson("/api/rolls/{$roll->id}/adjustments")
            ->assertOk()
            ->assertJsonPath('data.0.actor.name', 'Mama Trendy')
            ->assertJsonPath('data.0.reason', 'Recount');
    }
}
