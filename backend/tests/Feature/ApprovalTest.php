<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ApprovalTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Customer $bs60;

    private StockItem $cases;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = $this->userWith(Role::Cashier);
        $this->bs60 = Customer::factory()->stall('3rd floor')->create(['name' => 'BS 60']);
        $this->cases = $this->product('Pillow case', 'White', ['price_cents' => 25000, 'opening_quantity' => 20]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_goods_go_out_for_a_week_then_come_back_or_become_a_to_pay_sale(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-04-23 10:00', 'Africa/Nairobi'));
        $approval = $this->spa()->actingAs($this->cashier)->postJson('/api/approvals', [
            'customer_id' => $this->bs60->id,
            'lines' => [['stock_item_id' => $this->cases->id, 'quantity' => 9, 'unit_price_cents' => 22000]],
        ])->assertCreated()
            ->assertJsonPath('data.due_on', '2026-04-30')
            ->assertJsonPath('data.pieces_out', 9)
            ->assertJsonPath('data.overdue', false);
        $this->assertSame(11, $this->cases->refresh()->quantity);
        $id = $approval->json('data.id');
        $lineId = $approval->json('data.lines.0.id');

        // 4 come back, 3 were sold by BS 60 and go on their account.
        $settled = $this->spa()->actingAs($this->cashier)->postJson("/api/approvals/{$id}/settle", [
            'lines' => [['approval_line_id' => $lineId, 'returned' => 4, 'sold' => 3]],
            'payments' => [['method' => 'account', 'amount_cents' => 66000]],
        ])->assertOk()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.pieces_out', 2)
            ->assertJsonPath('sale.total_cents', 66000)
            ->assertJsonPath('sale.approval.id', $id);

        // Sold pieces left the shelf when they went out; they are not taken off again.
        $this->assertSame(15, $this->cases->refresh()->quantity);
        $this->spa()->actingAs($this->cashier)->getJson("/api/customers/{$this->bs60->id}")->assertJsonPath('data.owed_cents', 66000);

        // After the week, what is still out is overdue.
        Carbon::setTestNow(Carbon::parse('2026-05-01 09:00', 'Africa/Nairobi'));
        $this->spa()->actingAs($this->cashier)->getJson('/api/approvals')->assertJsonPath('data.0.overdue', true);

        $this->spa()->actingAs($this->cashier)->postJson("/api/approvals/{$id}/settle", [
            'lines' => [['approval_line_id' => $lineId, 'returned' => 2, 'sold' => 0]],
            'payments' => [],
        ])->assertOk()->assertJsonPath('data.status', 'closed')->assertJsonPath('data.overdue', false);
        $this->assertSame(17, $this->cases->refresh()->quantity);

        $this->spa()->actingAs($this->cashier)->getJson('/api/approvals')->assertJsonCount(0, 'data');
    }

    public function test_cannot_settle_more_than_is_out_or_issue_more_than_the_shelf_has(): void
    {
        $id = $this->spa()->actingAs($this->cashier)->postJson('/api/approvals', [
            'customer_id' => $this->bs60->id,
            'lines' => [['stock_item_id' => $this->cases->id, 'quantity' => 6]],
        ])->assertCreated();

        $this->spa()->actingAs($this->cashier)->postJson("/api/approvals/{$id->json('data.id')}/settle", [
            'lines' => [['approval_line_id' => $id->json('data.lines.0.id'), 'returned' => 5, 'sold' => 2]],
            'payments' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors(['lines.0.returned' => 'Only 6 of these are still out.']);

        $this->spa()->actingAs($this->cashier)->postJson('/api/approvals', [
            'customer_id' => $this->bs60->id,
            'lines' => [['stock_item_id' => $this->cases->id, 'quantity' => 15]],
        ])->assertUnprocessable()->assertJsonValidationErrors('lines.0.quantity');
    }

    public function test_a_sale_from_an_approval_is_returned_not_voided(): void
    {
        $approval = $this->spa()->actingAs($this->cashier)->postJson('/api/approvals', [
            'customer_id' => $this->bs60->id,
            'lines' => [['stock_item_id' => $this->cases->id, 'quantity' => 2, 'unit_price_cents' => 22000]],
        ]);
        $this->spa()->actingAs($this->cashier)->postJson("/api/approvals/{$approval->json('data.id')}/settle", [
            'lines' => [['approval_line_id' => $approval->json('data.lines.0.id'), 'returned' => 0, 'sold' => 2]],
            'payments' => [['method' => 'cash', 'amount_cents' => 44000]],
        ])->assertOk()->assertJsonPath('data.status', 'closed');

        $sale = Sale::whereNotNull('approval_id')->sole();
        $this->spa()->actingAs($this->userWith(Role::Manager))->postJson("/api/sales/{$sale->id}/void", ['reason' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
    }
}
