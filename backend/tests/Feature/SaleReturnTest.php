<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SaleReturnTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private StockItem $set;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = $this->userWith(Role::Manager);
        $this->set = $this->product('Window curtain', 'Grey', ['price_cents' => 260000, 'opening_quantity' => 5]);
    }

    public function test_one_of_two_sets_comes_back_for_its_share_of_what_was_paid(): void
    {
        $sale = $this->sell(['lines' => [['stock_item_id' => $this->set->id, 'quantity' => 2, 'total_cents' => 440000]], 'payments' => [['method' => 'cash', 'amount_cents' => 440000]]]);
        $lineId = $sale->json('data.lines.0.id');

        $this->returnItems($sale->json('data.id'), $lineId, 1, 'cash', 230000)
            ->assertUnprocessable()->assertJsonValidationErrors(['refund_cents' => 'The most that can be refunded for these items is KES 2,200.']);

        $this->returnItems($sale->json('data.id'), $lineId, 1, 'cash', 220000)
            ->assertCreated()
            ->assertJsonPath('data.lines.0.returned_quantity', 1)
            ->assertJsonPath('data.returns.0.refund_cents', 220000);

        $this->assertSame(4, $this->set->refresh()->quantity);

        $this->returnItems($sale->json('data.id'), $lineId, 2, 'none', 0)
            ->assertUnprocessable()->assertJsonValidationErrors(['lines.0.quantity' => 'Only 1 of Window curtain – Grey can still come back.']);

        $this->spa()->actingAs($this->manager)->getJson('/api/day-book')
            ->assertOk()->assertJsonPath('data.money.refunds_out.cash', 220000)->assertJsonCount(1, 'data.returns');
    }

    public function test_a_return_on_a_to_pay_sale_can_come_off_what_the_customer_owes(): void
    {
        $lily = Customer::factory()->create(['name' => 'Lily Collection']);
        $sale = $this->sell(['customer_id' => $lily->id, 'lines' => [['stock_item_id' => $this->set->id, 'quantity' => 2, 'total_cents' => 400000]], 'payments' => [['method' => 'account', 'amount_cents' => 400000]]]);

        $this->returnItems($sale->json('data.id'), $sale->json('data.lines.0.id'), 1, 'account', 200000)->assertCreated();

        $this->spa()->actingAs($this->manager)->getJson("/api/customers/{$lily->id}")->assertJsonPath('data.owed_cents', 200000);
    }

    public function test_a_walk_in_cannot_get_account_credit_and_a_returned_sale_cannot_be_voided(): void
    {
        $sale = $this->sell(['lines' => [['stock_item_id' => $this->set->id, 'quantity' => 1, 'total_cents' => 260000]], 'payments' => [['method' => 'cash', 'amount_cents' => 260000]]]);
        $id = $sale->json('data.id');

        $this->returnItems($id, $sale->json('data.lines.0.id'), 1, 'account', 0)
            ->assertUnprocessable()->assertJsonValidationErrors(['refund_method' => 'Only a sale to a named customer can be credited to their account.']);

        $this->returnItems($id, $sale->json('data.lines.0.id'), 1, 'none', 0)->assertCreated();

        $this->spa()->actingAs($this->manager)->postJson("/api/sales/{$id}/void", ['reason' => 'Mistake'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
    }

    public function test_cashiers_cannot_take_returns_by_default(): void
    {
        $sale = $this->sell(['lines' => [['stock_item_id' => $this->set->id, 'quantity' => 1, 'total_cents' => 260000]], 'payments' => [['method' => 'cash', 'amount_cents' => 260000]]]);

        $this->spa()->actingAs($this->userWith(Role::Cashier))->postJson("/api/sales/{$sale->json('data.id')}/returns", [
            'lines' => [['sale_line_id' => $sale->json('data.lines.0.id'), 'quantity' => 1]], 'refund_method' => 'cash', 'refund_cents' => 0, 'reason' => 'x',
        ])->assertForbidden();
    }

    private function sell(array $body): TestResponse
    {
        return $this->spa()->actingAs($this->manager)->postJson('/api/sales', $body)->assertCreated();
    }

    private function returnItems(int $saleId, int $lineId, int $quantity, string $method, int $refund): TestResponse
    {
        return $this->spa()->actingAs($this->manager)->postJson("/api/sales/{$saleId}/returns", [
            'lines' => [['sale_line_id' => $lineId, 'quantity' => $quantity]],
            'refund_method' => $method,
            'refund_cents' => $refund,
            'reason' => 'Wrong size for the window',
        ]);
    }
}
