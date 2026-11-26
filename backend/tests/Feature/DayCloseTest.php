<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DayCloseTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_drawer_should_hold_yesterdays_float_plus_cash_in_minus_cash_out(): void
    {
        $manager = $this->userWith(Role::Manager);
        $cashier = $this->userWith(Role::Cashier);
        $set = $this->product('Window curtain', 'Grey', ['price_cents' => 220000, 'opening_quantity' => 10]);
        $lily = Customer::factory()->create(['name' => 'Lily Collection']);

        // Yesterday: on credit to Lily, and 1,000 left in the drawer at closing.
        Carbon::setTestNow(Carbon::parse('2026-05-04 15:00', 'Africa/Nairobi'));
        $this->spa()->actingAs($cashier)->postJson('/api/sales', [
            'customer_id' => $lily->id,
            'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 200000]],
            'payments' => [['method' => 'account', 'amount_cents' => 200000]],
        ])->assertCreated();
        $this->spa()->actingAs($cashier)->postJson('/api/cash-counts', ['date' => '2026-05-04', 'counted_cents' => 150000, 'kept_cents' => 100000])->assertCreated();

        // Today.
        Carbon::setTestNow(Carbon::parse('2026-05-05 12:00', 'Africa/Nairobi'));
        $sale = $this->spa()->actingAs($cashier)->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 220000]],
        ])->assertCreated();
        $this->spa()->actingAs($cashier)->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'send_money', 'amount_cents' => 220000]],
        ])->assertCreated();
        $this->spa()->actingAs($cashier)->postJson("/api/customers/{$lily->id}/payments", ['method' => 'cash', 'amount_cents' => 50000])->assertCreated();
        $this->spa()->actingAs($manager)->postJson("/api/sales/{$sale->json('data.id')}/returns", [
            'lines' => [['sale_line_id' => $sale->json('data.lines.0.id'), 'quantity' => 1]], 'refund_method' => 'cash', 'refund_cents' => 30000, 'reason' => 'Small stain',
        ])->assertCreated();
        $this->spa()->actingAs($cashier)->postJson('/api/expenses', ['category' => 'transport', 'amount_cents' => 40000, 'method' => 'cash', 'paid_to' => 'Boda'])->assertCreated();
        $voided = $this->spa()->actingAs($cashier)->postJson('/api/expenses', ['category' => 'food', 'amount_cents' => 99900, 'method' => 'cash'])->json('data.id');
        $this->spa()->actingAs($manager)->postJson("/api/expenses/{$voided}/void", ['reason' => 'Typed twice'])->assertOk();

        // 1,000 float + 2,200 sale + 500 from Lily − 300 refund − 400 transport = 3,000.
        $this->spa()->actingAs($cashier)->getJson('/api/day-book')
            ->assertOk()
            ->assertJsonPath('data.money.opening_cash_cents', 100000)
            ->assertJsonPath('data.money.expected_cash_cents', 300000)
            ->assertJsonPath('data.money.net_by_method.send_money', 220000)
            ->assertJsonPath('data.money.expenses_out.cash', 40000)
            ->assertJsonCount(2, 'data.expenses');

        $this->spa()->actingAs($cashier)->postJson('/api/cash-counts', ['date' => '2026-05-05', 'counted_cents' => 290000, 'kept_cents' => 50000, 'note' => 'Short 100'])
            ->assertCreated()
            ->assertJsonPath('data.expected_cents', 300000)
            ->assertJsonPath('data.difference_cents', -10000);

        $this->spa()->actingAs($cashier)->getJson('/api/day-book')->assertJsonPath('data.money.count.counted_cents', 290000);
    }

    public function test_a_future_day_cannot_be_closed_and_the_drawer_cannot_keep_more_than_counted(): void
    {
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($cashier)->postJson('/api/cash-counts', ['date' => now('Africa/Nairobi')->addDay()->toDateString(), 'counted_cents' => 0, 'kept_cents' => 0])
            ->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->spa()->actingAs($cashier)->postJson('/api/cash-counts', ['date' => now('Africa/Nairobi')->toDateString(), 'counted_cents' => 1000, 'kept_cents' => 2000])
            ->assertUnprocessable()->assertJsonValidationErrors(['kept_cents' => 'You cannot leave more in the drawer than you counted.']);
    }

    public function test_tailors_cannot_record_expenses_or_count_cash(): void
    {
        $tailor = $this->userWith(Role::Tailor);

        $this->spa()->actingAs($tailor)->postJson('/api/expenses', ['category' => 'food', 'amount_cents' => 100, 'method' => 'cash'])->assertForbidden();
        $this->spa()->actingAs($tailor)->postJson('/api/cash-counts', ['date' => now()->toDateString(), 'counted_cents' => 0, 'kept_cents' => 0])->assertForbidden();
    }
}
