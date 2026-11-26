<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class HomeScreenTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @return array<string, array<string, string>> alerts keyed by their key */
    private function alerts(TestResponse $response): array
    {
        return collect($response->json('data.attention'))->keyBy('key')->all();
    }

    public function test_the_owner_sees_todays_money_against_last_week_and_what_went_wrong(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier, ['name' => 'Jane']);
        $manager = $this->userWith(Role::Manager);
        $set = $this->product('Window curtain', 'Grey', ['price_cents' => 220000, 'opening_quantity' => 20]);
        $sell = fn (int $total, array $payment) => $this->spa()->actingAs($cashier)->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => $total]],
            'payments' => [['amount_cents' => $total, ...$payment]],
        ])->assertCreated()->json('data');

        // Tuesday last week, 09:00 Nairobi: 2,200 by this time, another 2,200 later that day.
        Carbon::setTestNow(Carbon::parse('2026-05-05 06:00:00', 'UTC'));
        $sell(220000, ['method' => 'cash']);
        Carbon::setTestNow(Carbon::parse('2026-05-05 12:00:00', 'UTC'));
        $sell(220000, ['method' => 'cash']);

        // Monday: cash sales, and the drawer counted 500 short.
        Carbon::setTestNow(Carbon::parse('2026-05-11 09:00:00', 'UTC'));
        $sell(220000, ['method' => 'cash']);
        $this->spa()->actingAs($cashier)->postJson('/api/cash-counts', ['date' => '2026-05-11', 'counted_cents' => 170000, 'kept_cents' => 0])->assertCreated();

        // Tuesday this week, before 10:00 Nairobi.
        Carbon::setTestNow(Carbon::parse('2026-05-12 06:30:00', 'UTC'));
        $sell(220000, ['method' => 'send_money']);
        $cheap = $sell(150000, ['method' => 'cash']);
        $voided = $sell(220000, ['method' => 'cash']);
        $this->spa()->actingAs($manager)->postJson("/api/sales/{$voided['id']}/void", ['reason' => 'Customer changed mind'])->assertOk();

        $response = $this->spa()->actingAs($owner)->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.today.sales_count', 2)
            ->assertJsonPath('data.today.sales_cents', 370000)
            ->assertJsonPath('data.today.last_week_weekday', 'Tuesday')
            ->assertJsonPath('data.today.last_week_same_time_cents', 220000)
            ->assertJsonPath('data.today.in_by_method.send_money', 220000)
            ->assertJsonPath('data.month.sales_cents', 370000 + 220000 + 440000)
            ->assertJsonPath('data.recent_sales.0.status', 'voided');

        $alerts = $this->alerts($response);
        $this->assertSame('Cash count yesterday was short by KES 500', $alerts['cash-count']['title']);
        $this->assertSame('/day-book?date=2026-05-11', $alerts['cash-count']['link']);
        $this->assertSame("/day-book?date=2026-05-12&sale={$voided['id']}", $alerts["void-{$voided['id']}"]['link']);
        $this->assertStringContainsString('Customer changed mind', $alerts["void-{$voided['id']}"]['detail']);
        $this->assertStringContainsString('(32% off) by Jane', $alerts["discount-{$cheap['id']}"]['detail']);
        $this->assertSame('1 M-Pesa payment without a code today', $alerts['mpesa-codes']['title']);
        $this->assertArrayNotHasKey('not-counted', $alerts);
        $this->assertSame('danger', $response->json('data.attention.0.tone'));

        // A cashier gets today's money but none of the owner's checks.
        $cashierAlerts = $this->alerts($this->spa()->actingAs($cashier)->getJson('/api/dashboard')->assertOk()->assertJsonMissingPath('data.month'));
        $this->assertArrayNotHasKey('cash-count', $cashierAlerts);
        $this->assertArrayNotHasKey("void-{$voided['id']}", $cashierAlerts);
    }

    public function test_orders_and_goods_on_approval_that_need_a_call_link_to_the_exact_record(): void
    {
        $cashier = $this->userWith(Role::Cashier);
        $lily = Customer::factory()->create(['name' => 'Lily', 'phone' => '254712403671']);
        $shop = Customer::factory()->create(['name' => 'Mama Joy', 'stall' => 'BS 60']);
        $cases = $this->product('Pillow case', 'Cream', ['price_cents' => 30000, 'opening_quantity' => 20]);
        $order = fn (string $due) => $this->spa()->actingAs($cashier)->postJson('/api/orders', [
            'customer_id' => $lily->id, 'due_on' => $due,
            'lines' => [['kind' => 'work', 'description' => 'Sewing 2 window sets', 'total_cents' => 300000]],
        ])->assertCreated()->json('data.id');

        Carbon::setTestNow(Carbon::parse('2026-05-01 07:00:00', 'UTC'));
        $late = $order('2026-05-08');
        $ready = $order('2026-05-20');
        $this->spa()->actingAs($cashier)->postJson("/api/orders/{$ready}/ready")->assertOk();
        $approval = $this->spa()->actingAs($cashier)->postJson('/api/approvals', [
            'customer_id' => $shop->id,
            'lines' => [['stock_item_id' => $cases->id, 'quantity' => 5, 'unit_price_cents' => 25000]],
        ])->assertCreated()->json('data.id');

        Carbon::setTestNow(Carbon::parse('2026-05-10 07:00:00', 'UTC'));
        $alerts = $this->alerts($this->spa()->actingAs($cashier)->getJson('/api/dashboard')->assertOk());

        $this->assertSame("Lily's order is ready to collect", $alerts['orders-ready']['title']);
        $this->assertSame("/orders?order={$ready}", $alerts['orders-ready']['link']);
        $this->assertStringContainsString('0712 403 671', $alerts['orders-ready']['detail']);
        $this->assertSame("Lily's order is 2 days late", $alerts["order-late-{$late}"]['title']);
        $this->assertSame("/orders?order={$late}", $alerts["order-late-{$late}"]['link']);
        $this->assertSame('Mama Joy (BS 60) has kept goods 9 days', $alerts["approval-{$approval}"]['title']);
        $this->assertSame("/approvals?approval={$approval}", $alerts["approval-{$approval}"]['link']);

        // The tailor sees the late job and the work list, not the money.
        $tailor = $this->spa()->actingAs($this->userWith(Role::Tailor))->getJson('/api/dashboard')->assertOk()
            ->assertJsonMissingPath('data.today')
            ->assertJsonPath('data.work.0.id', $late)
            ->assertJsonPath('data.work.0.overdue', true);
        $this->assertArrayHasKey("order-late-{$late}", $this->alerts($tailor));
        $this->assertArrayNotHasKey("approval-{$approval}", $this->alerts($tailor));
    }
}
