<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Roll;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Customer $customer;

    private Roll $curtainRoll;

    private Roll $sheerRoll;

    private StockItem $rod;

    protected function setUp(): void
    {
        parent::setUp();
        $owner = $this->userWith(Role::Owner);
        $this->cashier = $this->userWith(Role::Cashier);
        $this->customer = Customer::factory()->create(['name' => 'Wanjiku', 'phone' => '0712 345 678']);
        $this->curtainRoll = $this->receivedRoll($owner);
        $this->sheerRoll = $this->receivedRoll($owner, ['received_cm' => 3000, 'stated_cm' => 3000]);
        $this->rod = $this->product('Curtain rod', null, ['variant' => '3 m', 'price_cents' => 130000, 'opening_quantity' => 4]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_an_order_from_the_book_goes_from_deposit_to_collection(): void
    {
        // "14 metres curtain + 9 m sheer + kitchen curtain = 20,300; deposit 15,000, balance 5,300."
        $order = $this->takeOrder(deposit: ['method' => 'paybill', 'amount_cents' => 1500000, 'mpesa_code' => 'tkl3x9abcd'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'taken')
            ->assertJsonPath('data.total_cents', 2030000)
            ->assertJsonPath('data.paid_cents', 1500000)
            ->assertJsonPath('data.balance_cents', 530000)
            ->assertJsonPath('data.payments.0.mpesa_code', 'TKL3X9ABCD');
        $id = $order->json('data.id');

        // Nothing is cut until work starts.
        $this->assertSame(5000, $this->curtainRoll->refresh()->balance_cm);

        $tailor = $this->userWith(Role::Tailor);
        $this->spa()->actingAs($tailor)->postJson("/api/orders/{$id}/start")->assertOk()->assertJsonPath('data.status', 'in_work');
        $this->assertSame(3600, $this->curtainRoll->refresh()->balance_cm);
        $this->assertSame(2100, $this->sheerRoll->refresh()->balance_cm);

        $this->spa()->actingAs($tailor)->postJson("/api/orders/{$id}/ready")->assertOk()->assertJsonPath('data.status', 'ready');

        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/collect", ['payments' => [['method' => 'cash', 'amount_cents' => 500000]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['payments' => 'The balance is KES 5,300 but the payments add up to KES 5,000.']);

        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/collect", ['payments' => [['method' => 'cash', 'amount_cents' => 530000]]])
            ->assertOk()->assertJsonPath('data.status', 'collected')->assertJsonPath('data.balance_cents', 0);

        // The rod leaves the shelf at collection; the fabric is not cut twice.
        $this->assertSame(3, $this->rod->refresh()->quantity);
        $this->assertSame(3600, $this->curtainRoll->refresh()->balance_cm);

        $this->spa()->actingAs($this->cashier)->getJson('/api/day-book')
            ->assertOk()
            ->assertJsonCount(2, 'data.order_payments')
            ->assertJsonPath('data.money.order_payments_in.paybill', 1500000)
            ->assertJsonPath('data.money.order_payments_in.cash', 530000)
            ->assertJsonPath('data.money.expected_cash_cents', 530000);
    }

    public function test_part_payments_cannot_go_over_the_balance_and_the_rest_can_go_on_to_pay(): void
    {
        $id = $this->takeOrder()->json('data.id');

        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/payments", ['method' => 'cash', 'amount_cents' => 2100000])
            ->assertUnprocessable()->assertJsonValidationErrors(['amount_cents' => 'The balance on '.$this->orderNumber($id).' is only KES 20,300.']);
        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/payments", ['method' => 'send_money', 'amount_cents' => 1000000])
            ->assertOk()->assertJsonPath('data.balance_cents', 1030000);

        // Collected straight from "taken": the fabric is cut then, and the balance goes on their account.
        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/collect", ['payments' => [['method' => 'account', 'amount_cents' => 1030000]]])
            ->assertOk()->assertJsonPath('data.status', 'collected');
        $this->assertSame(3600, $this->curtainRoll->refresh()->balance_cm);

        $this->spa()->actingAs($this->cashier)->getJson("/api/customers/{$this->customer->id}")
            ->assertJsonPath('data.owed_cents', 1030000)
            ->assertJsonPath('orders.0.status', 'collected');
    }

    public function test_a_deposit_must_be_money_and_work_lines_need_a_description(): void
    {
        $this->takeOrder(deposit: ['method' => 'account', 'amount_cents' => 1000])->assertUnprocessable()->assertJsonValidationErrors('deposit.method');

        $this->spa()->actingAs($this->cashier)->postJson('/api/orders', [
            'customer_id' => $this->customer->id,
            'due_on' => now('Africa/Nairobi')->addWeek()->toDateString(),
            'lines' => [['kind' => 'work', 'total_cents' => 50000]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['lines.0.description' => 'Describe the work, e.g. Sewing 3 window sets, 2.6 m drop.']);
    }

    public function test_cancelling_gives_back_part_of_the_deposit_on_the_day_and_needs_permission(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-04 10:00', 'Africa/Nairobi'));
        $id = $this->takeOrder(deposit: ['method' => 'cash', 'amount_cents' => 1000000])->json('data.id');

        Carbon::setTestNow(Carbon::parse('2026-05-06 10:00', 'Africa/Nairobi'));
        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/cancel", ['reason' => 'x', 'refund_cents' => 0])->assertForbidden();

        $manager = $this->userWith(Role::Manager);
        $this->spa()->actingAs($manager)->postJson("/api/orders/{$id}/cancel", ['reason' => 'Customer changed her mind', 'refund_cents' => 1200000, 'refund_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors(['refund_cents' => 'Only KES 10,000 was paid on this order.']);
        $this->spa()->actingAs($manager)->postJson("/api/orders/{$id}/cancel", ['reason' => 'Customer changed her mind', 'refund_cents' => 700000, 'refund_method' => 'cash'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.balance_cents', 0);

        $this->spa()->actingAs($manager)->getJson('/api/day-book?date=2026-05-06')->assertJsonPath('data.money.refunds_out.cash', 700000);
        $this->spa()->actingAs($manager)->getJson('/api/day-book?date=2026-05-04')->assertJsonPath('data.money.order_payments_in.cash', 1000000);
    }

    public function test_an_order_is_overdue_after_its_due_date_until_it_is_ready(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-04 10:00', 'Africa/Nairobi'));
        $id = $this->takeOrder(dueOn: '2026-05-08')->json('data.id');

        Carbon::setTestNow(Carbon::parse('2026-05-09 10:00', 'Africa/Nairobi'));
        $this->spa()->actingAs($this->cashier)->getJson('/api/orders')->assertJsonPath('data.0.overdue', true);
        $this->spa()->actingAs($this->cashier)->postJson("/api/orders/{$id}/ready")->assertOk()->assertJsonPath('data.overdue', false);
        $this->spa()->actingAs($this->cashier)->getJson('/api/orders?status=ready')->assertJsonCount(1, 'data');
    }

    private function takeOrder(?array $deposit = null, ?string $dueOn = null): TestResponse
    {
        return $this->spa()->actingAs($this->cashier)->postJson('/api/orders', array_filter([
            'customer_id' => $this->customer->id,
            'due_on' => $dueOn ?? now('Africa/Nairobi')->addWeek()->toDateString(),
            'lines' => [
                ['kind' => 'fabric', 'roll_id' => $this->curtainRoll->id, 'length_cm' => 1400, 'total_cents' => 1260000, 'description' => 'Sitting room'],
                ['kind' => 'fabric', 'roll_id' => $this->sheerRoll->id, 'length_cm' => 900, 'total_cents' => 360000],
                ['kind' => 'work', 'description' => 'Sewing 2 window sets and a kitchen curtain', 'total_cents' => 280000],
                ['kind' => 'product', 'stock_item_id' => $this->rod->id, 'quantity' => 1, 'total_cents' => 130000],
            ],
            'deposit' => $deposit,
        ], fn ($v) => $v !== null));
    }

    private function orderNumber(int $id): string
    {
        return Order::findOrFail($id)->number;
    }
}
