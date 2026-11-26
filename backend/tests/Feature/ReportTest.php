<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Support\RolePermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_report_adds_up_sales_returns_money_best_sellers_profit_and_debts_for_the_dates(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier);
        $manager = $this->userWith(Role::Manager);
        $set = $this->product('Window curtain', 'Grey', ['cost_cents' => 120000, 'opening_quantity' => 10]);
        // 50 m roll bought for 20,000: 2 m of it cost 800.
        $roll = $this->receivedRoll($owner);
        $lily = $this->spa()->actingAs($cashier)->postJson('/api/customers', ['name' => 'Lily', 'stall' => 'BS 60'])->json('data.id');
        $sell = fn (array $body) => $this->spa()->actingAs($cashier)->postJson('/api/sales', $body)->assertCreated()->json('data');

        Carbon::setTestNow(Carbon::parse('2026-04-10 09:00:00', 'UTC'));
        $first = $sell(['lines' => [['stock_item_id' => $set->id, 'quantity' => 2, 'total_cents' => 440000]], 'payments' => [['method' => 'cash', 'amount_cents' => 440000]]]);
        $sell(['customer_id' => $lily, 'lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 200000]], 'payments' => [['method' => 'account', 'amount_cents' => 200000]]]);
        $sell(['lines' => [['roll_id' => $roll->id, 'length_cm' => 200, 'total_cents' => 90000]], 'payments' => [['method' => 'send_money', 'amount_cents' => 90000]]]);
        $voided = $sell(['lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 220000]], 'payments' => [['method' => 'cash', 'amount_cents' => 220000]]]);
        $this->spa()->actingAs($manager)->postJson("/api/sales/{$voided['id']}/void", ['reason' => 'Typed twice'])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-04-11 09:00:00', 'UTC'));
        $this->spa()->actingAs($manager)->postJson("/api/sales/{$first['id']}/returns", [
            'lines' => [['sale_line_id' => $first['lines'][0]['id'], 'quantity' => 1]],
            'refund_method' => 'cash', 'refund_cents' => 220000, 'reason' => 'Wrong size',
        ])->assertCreated();
        $this->spa()->actingAs($cashier)->postJson('/api/expenses', ['category' => 'transport', 'amount_cents' => 40000, 'method' => 'cash'])->assertCreated();

        // Outside the range.
        Carbon::setTestNow(Carbon::parse('2026-05-01 09:00:00', 'UTC'));
        $sell(['lines' => [['stock_item_id' => $set->id, 'quantity' => 1, 'total_cents' => 220000]], 'payments' => [['method' => 'cash', 'amount_cents' => 220000]]]);

        $this->spa()->actingAs($manager)->getJson('/api/reports?from=2026-04-01&to=2026-04-30')
            ->assertOk()
            ->assertJsonPath('data.days', 30)
            ->assertJsonPath('data.sales.count', 3)
            ->assertJsonPath('data.sales.total_cents', 730000)
            ->assertJsonPath('data.sales.returned_goods_cents', 220000)
            ->assertJsonPath('data.sales.net_cents', 510000)
            ->assertJsonPath('data.money.in_cents', 530000)
            ->assertJsonPath('data.money.out_cents', 260000)
            ->assertJsonPath('data.money.put_on_account_cents', 200000)
            ->assertJsonPath('data.top_products.0.quantity', 2)
            ->assertJsonPath('data.top_products.0.total_cents', 420000)
            ->assertJsonPath('data.top_fabrics.0.length_cm', 200)
            ->assertJsonPath('data.categories.0.name', 'Window curtain')
            ->assertJsonPath('data.categories.1.name', 'Fabric by the metre')
            ->assertJsonPath('data.expenses.by_category.0.category', 'transport')
            ->assertJsonPath('data.staff.0.total_cents', 730000)
            ->assertJsonPath('data.chart.bucket', 'day')
            ->assertJsonCount(30, 'data.chart.points')
            ->assertJsonPath('data.chart.points.9.sales_cents', 730000)
            // 510,000 in − (2 sets × 1,200 + 800 of fabric) = 190,000; less 400 transport.
            ->assertJsonPath('data.profit.cost_cents', 320000)
            ->assertJsonPath('data.profit.gross_cents', 190000)
            ->assertJsonPath('data.profit.after_expenses_cents', 150000)
            ->assertJsonPath('data.debtors.count', 1)
            ->assertJsonPath('data.debtors.customers.0.owed_cents', 200000);

        $this->spa()->actingAs($manager)->getJson('/api/reports?from=2026-01-01&to=2026-12-31')
            ->assertOk()->assertJsonPath('data.chart.bucket', 'month')->assertJsonCount(12, 'data.chart.points');
    }

    public function test_only_roles_allowed_to_see_reports_can_and_profit_needs_cost_access(): void
    {
        $cashier = $this->userWith(Role::Cashier);
        $this->spa()->actingAs($cashier)->getJson('/api/reports')->assertForbidden();

        RolePermissions::sync('cashier', ['sell', 'view_reports']);
        $this->spa()->actingAs($cashier)->getJson('/api/reports')->assertOk()->assertJsonMissingPath('data.profit');
    }

    public function test_the_dates_must_make_a_range_of_at_most_a_year(): void
    {
        $manager = $this->userWith(Role::Manager);

        $this->spa()->actingAs($manager)->getJson('/api/reports?from=2026-04-10&to=2026-04-01')->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->spa()->actingAs($manager)->getJson('/api/reports?from=2025-01-01&to=2026-04-01')->assertUnprocessable()->assertJsonValidationErrors('from');
    }
}
