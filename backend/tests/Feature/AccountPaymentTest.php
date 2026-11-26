<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountPaymentTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Customer $lily;

    private StockItem $set;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = $this->userWith(Role::Cashier);
        $this->lily = Customer::factory()->stall('2nd floor')->create(['name' => 'Lily Collection']);
        $this->set = $this->product('Window curtain', 'Grey', ['price_cents' => 220000, 'opening_quantity' => 10]);
        $this->spa()->actingAs($this->cashier)->postJson('/api/sales', [
            'customer_id' => $this->lily->id,
            'lines' => [['stock_item_id' => $this->set->id, 'quantity' => 2, 'total_cents' => 400000]],
            'payments' => [['method' => 'account', 'amount_cents' => 400000]],
        ])->assertCreated();
    }

    public function test_paying_towards_the_account_reduces_what_is_owed_and_shows_in_the_day_book(): void
    {
        $this->spa()->actingAs($this->cashier)->postJson("/api/customers/{$this->lily->id}/payments", [
            'method' => 'send_money', 'amount_cents' => 150000, 'mpesa_code' => 'tkl3x9abcd',
        ])->assertCreated()
            ->assertJsonPath('data.mpesa_code', 'TKL3X9ABCD')
            ->assertJsonPath('data.owed_after_cents', 250000);

        $this->spa()->actingAs($this->cashier)->getJson('/api/customers?owing=1')
            ->assertOk()->assertJsonPath('data.0.owed_cents', 250000);

        $this->spa()->actingAs($this->cashier)->getJson('/api/day-book')
            ->assertOk()
            ->assertJsonCount(1, 'data.account_payments')
            ->assertJsonPath('data.account_payments.0.customer.name', 'Lily Collection')
            ->assertJsonPath('data.money.account_payments_in.send_money', 150000)
            ->assertJsonPath('data.money.put_on_account_cents', 400000);
    }

    public function test_a_payment_cannot_be_more_than_what_is_owed(): void
    {
        $this->spa()->actingAs($this->cashier)->postJson("/api/customers/{$this->lily->id}/payments", [
            'method' => 'cash', 'amount_cents' => 500000,
        ])->assertUnprocessable()->assertJsonValidationErrors(['amount_cents' => 'Lily Collection only owes KES 4,000.']);

        $other = Customer::factory()->create(['name' => 'Mercy']);
        $this->spa()->actingAs($this->cashier)->postJson("/api/customers/{$other->id}/payments", [
            'method' => 'cash', 'amount_cents' => 1000,
        ])->assertUnprocessable()->assertJsonValidationErrors(['amount_cents' => 'Mercy does not owe anything.']);
    }

    public function test_an_mpesa_code_used_on_a_sale_cannot_pay_an_account(): void
    {
        $this->spa()->actingAs($this->cashier)->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $this->set->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'paybill', 'amount_cents' => 220000, 'mpesa_code' => 'QWE1234567']],
        ])->assertCreated();

        $this->spa()->actingAs($this->cashier)->postJson("/api/customers/{$this->lily->id}/payments", [
            'method' => 'paybill', 'amount_cents' => 10000, 'mpesa_code' => 'QWE1234567',
        ])->assertUnprocessable()->assertJsonValidationErrors('mpesa_code');
    }

    public function test_voiding_an_account_payment_puts_the_debt_back_and_needs_permission(): void
    {
        $id = $this->spa()->actingAs($this->cashier)->postJson("/api/customers/{$this->lily->id}/payments", [
            'method' => 'cash', 'amount_cents' => 100000,
        ])->assertCreated()->json('data.id');

        $this->spa()->actingAs($this->cashier)->postJson("/api/account-payments/{$id}/void", ['reason' => 'Wrong customer'])->assertForbidden();

        $manager = $this->userWith(Role::Manager);
        $this->spa()->actingAs($manager)->postJson("/api/account-payments/{$id}/void", ['reason' => 'Wrong customer'])
            ->assertOk()->assertJsonPath('data.voided', true)->assertJsonPath('data.voided_by.id', $manager->id);

        $this->spa()->actingAs($this->cashier)->getJson("/api/customers/{$this->lily->id}")
            ->assertOk()->assertJsonPath('data.owed_cents', 400000)->assertJsonPath('account_payments.0.voided', true);

        $salePayment = Payment::whereNotNull('sale_id')->firstOrFail();
        $this->spa()->actingAs($manager)->postJson("/api/account-payments/{$salePayment->id}/void", ['reason' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors(['reason' => 'A sale payment is voided together with its sale.']);
    }
}
