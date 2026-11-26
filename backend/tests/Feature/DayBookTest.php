<?php

namespace Tests\Feature;

use App\Enums\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DayBookTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_day_book_totals_each_payment_method_for_the_nairobi_day(): void
    {
        $cashier = $this->userWith(Role::Cashier);
        $set = $this->product('Window curtain', 'Black', ['price_cents' => 220000, 'opening_quantity' => 10]);
        $sell = fn (array $payments, int $total) => $this->spa()->actingAs($cashier)->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => $total]],
            'payments' => $payments,
        ])->assertCreated();

        // 23:30 in Nairobi on 21 April is 20:30 UTC: still the 21st in the shop.
        Carbon::setTestNow(Carbon::parse('2026-04-21 20:30:00', 'UTC'));
        $sell([['method' => 'cash', 'amount_cents' => 220000]], 220000);

        // 00:30 on 22 April in Nairobi is 21:30 UTC on the 21st.
        Carbon::setTestNow(Carbon::parse('2026-04-21 21:30:00', 'UTC'));
        $sell([['method' => 'send_money', 'amount_cents' => 200000]], 200000);
        $sell([['method' => 'paybill', 'amount_cents' => 100000, 'mpesa_code' => 'TKL3X9ABCD'], ['method' => 'cash', 'amount_cents' => 120000]], 220000);
        $voided = $sell([['method' => 'cash', 'amount_cents' => 220000]], 220000)->json('data.id');
        $this->spa()->actingAs($this->userWith(Role::Manager))->postJson("/api/sales/{$voided}/void", ['reason' => 'Test'])->assertOk();

        $this->spa()->actingAs($cashier)->getJson('/api/day-book?date=2026-04-22')
            ->assertOk()
            ->assertJsonPath('data.weekday', 'Wednesday')
            ->assertJsonCount(3, 'data.sales')
            ->assertJsonPath('data.totals.total_cents', 420000)
            ->assertJsonPath('data.totals.by_method.cash', 120000)
            ->assertJsonPath('data.totals.by_method.send_money', 200000)
            ->assertJsonPath('data.totals.by_method.paybill', 100000)
            ->assertJsonPath('data.totals.sales_count', 2)
            ->assertJsonPath('data.totals.voided_count', 1)
            ->assertJsonPath('data.totals.missing_mpesa_codes', 1)
            ->assertJsonPath('data.totals.below_asking_cents', 20000);

        $this->spa()->actingAs($cashier)->getJson('/api/day-book?date=2026-04-21')
            ->assertOk()
            ->assertJsonPath('data.totals.total_cents', 220000);
    }

    public function test_only_staff_who_sell_can_read_the_day_book(): void
    {
        $this->spa()->actingAs($this->userWith(Role::Tailor))->getJson('/api/day-book')->assertForbidden();
    }
}
