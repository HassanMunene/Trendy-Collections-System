<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\StockItem;
use App\Models\StockItemMovement;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CounterSaleTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private StockItem $greySet;

    private StockItem $door;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashier = $this->userWith(Role::Cashier);
        $this->greySet = $this->product('Window curtain', 'Grey', ['price_cents' => 260000, 'opening_quantity' => 5]);
        $this->door = $this->product('Door curtain', 'Grey', ['price_cents' => 120000, 'opening_quantity' => 2]);
    }

    public function test_one_set_and_half_with_sheer_by_the_metre_is_one_basket_paid_two_ways(): void
    {
        $sheerRoll = $this->receivedRoll($this->userWith(Role::Owner), ['fabric' => ['retail_price_cents_per_m' => 45000]]);

        $res = $this->sell([
            'customer_name' => ' Irene ',
            'lines' => [
                ['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 250000],
                ['stock_item_id' => $this->door->id, 'quantity' => 1, 'total_cents' => 100000],
                ['roll_id' => $sheerRoll->id, 'length_cm' => 200, 'total_cents' => 90000],
            ],
            'payments' => [
                ['method' => 'send_money', 'amount_cents' => 300000, 'mpesa_code' => 'tkl3x9 abcd'],
                ['method' => 'cash', 'amount_cents' => 140000],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.customer_name', 'Irene')
            ->assertJsonPath('data.total_cents', 440000)
            ->assertJsonPath('data.lines.0.description', 'Window curtain – Grey')
            ->assertJsonPath('data.lines.0.asking_total_cents', 260000)
            ->assertJsonPath('data.lines.2.asking_total_cents', 90000)
            ->assertJsonPath('data.payments.0.mpesa_code', 'TKL3X9ABCD')
            ->assertJsonPath('data.sold_by.id', $this->cashier->id);

        $this->assertMatchesRegularExpression('/^S\d{5}$/', $res->json('data.number'));
        $this->assertSame(4, $this->greySet->refresh()->quantity);
        $this->assertSame(1, $this->door->refresh()->quantity);
        $this->assertSame(4800, $sheerRoll->refresh()->balance_cm);
        $this->assertSame('sale', StockItemMovement::where('stock_item_id', $this->greySet->id)->latest('id')->value('kind'));
        $this->assertTrue(AuditEvent::where('action', 'sale.recorded')->where('entity_id', $res->json('data.id'))->exists());
    }

    public function test_payments_must_add_up_to_the_total_and_nothing_is_posted_otherwise(): void
    {
        $this->sell([
            'lines' => [['stock_item_id' => $this->greySet->id, 'quantity' => 2, 'total_cents' => 440000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 400000]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['payments' => 'Payments add up to KES 4,000 but the sale is KES 4,400.']);

        $this->assertSame(0, Sale::count());
        $this->assertSame(5, $this->greySet->refresh()->quantity);
    }

    public function test_a_sale_cannot_take_more_than_is_on_the_shelf(): void
    {
        $this->sell([
            'lines' => [['stock_item_id' => $this->door->id, 'quantity' => 3, 'total_cents' => 300000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 300000]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['lines.0.quantity' => 'Only 2 piece of Door curtain – Grey left.']);

        $this->assertSame(0, Sale::count());
        $this->assertSame(2, $this->door->refresh()->quantity);
    }

    public function test_to_pay_needs_a_customer_and_then_shows_as_owed(): void
    {
        $line = [['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 200000]];

        $this->sell(['lines' => $line, 'payments' => [['method' => 'account', 'amount_cents' => 200000]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['payments.0.method' => 'Choose the customer before putting a sale on "to pay".']);

        $lily = Customer::factory()->stall('2nd floor')->create(['name' => 'Lily Collection']);
        $this->sell(['customer_id' => $lily->id, 'lines' => $line, 'payments' => [['method' => 'account', 'amount_cents' => 200000]]])
            ->assertCreated();

        $this->spa()->actingAs($this->cashier)->getJson('/api/customers?owing=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Lily Collection')
            ->assertJsonPath('data.0.owed_cents', 200000);
    }

    public function test_an_mpesa_code_counts_once_until_its_sale_is_voided(): void
    {
        $basket = fn () => [
            'lines' => [['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'paybill', 'amount_cents' => 220000, 'mpesa_code' => 'TKL3X9ABCD']],
        ];
        $first = $this->sell($basket())->assertCreated();

        $this->sell($basket())->assertUnprocessable()
            ->assertJsonValidationErrors(['payments.0.mpesa_code' => "M-Pesa code TKL3X9ABCD is already on sale {$first->json('data.number')}."]);

        $this->spa()->actingAs($this->userWith(Role::Manager))
            ->postJson("/api/sales/{$first->json('data.id')}/void", ['reason' => 'Entered twice'])->assertOk();

        $this->sell($basket())->assertCreated();
    }

    public function test_cash_cannot_carry_an_mpesa_code(): void
    {
        $this->sell([
            'lines' => [['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 220000, 'mpesa_code' => 'TKL3X9ABCD']],
        ])->assertUnprocessable()->assertJsonValidationErrors(['payments.0.mpesa_code' => 'Only M-Pesa payments have a code.']);
    }

    public function test_voiding_puts_stock_back_keeps_the_record_and_needs_permission(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner));
        $sale = $this->sell([
            'lines' => [
                ['stock_item_id' => $this->greySet->id, 'quantity' => 2, 'total_cents' => 440000],
                ['roll_id' => $roll->id, 'length_cm' => 300, 'total_cents' => 150000],
            ],
            'payments' => [['method' => 'cash', 'amount_cents' => 590000]],
        ]);
        $saleId = $sale->json('data.id');

        $this->spa()->actingAs($this->cashier)->postJson("/api/sales/{$saleId}/void", ['reason' => 'Wrong colour'])->assertForbidden();

        $manager = $this->userWith(Role::Manager);
        $this->spa()->actingAs($manager)->postJson("/api/sales/{$saleId}/void", ['reason' => 'Wrong colour'])
            ->assertOk()
            ->assertJsonPath('data.status', 'voided')
            ->assertJsonPath('data.voided_by.id', $manager->id)
            ->assertJsonPath('data.payments.0.voided', true);

        $this->assertSame(5, $this->greySet->refresh()->quantity);
        $this->assertSame(5000, $roll->refresh()->balance_cm);

        $this->spa()->actingAs($manager)->postJson("/api/sales/{$saleId}/void", ['reason' => 'Again'])
            ->assertUnprocessable()->assertJsonValidationErrors(['reason' => "Sale {$sale->json('data.number')} is already voided."]);
        $this->assertSame(5, $this->greySet->refresh()->quantity);
    }

    public function test_the_database_refuses_to_edit_a_posted_sale_or_payment(): void
    {
        $saleId = $this->sell([
            'lines' => [['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 220000]],
        ])->json('data.id');

        try {
            Sale::whereKey($saleId)->update(['total_cents' => 1]);
            $this->fail('A posted sale total was changed.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('A posted sale can only be voided', $e->getMessage());
        }

        $this->expectException(QueryException::class);
        Payment::where('sale_id', $saleId)->update(['amount_cents' => 1]);
    }

    public function test_a_tailor_cannot_sell(): void
    {
        $this->spa()->actingAs($this->userWith(Role::Tailor))->postJson('/api/sales', [
            'lines' => [['stock_item_id' => $this->greySet->id, 'quantity' => 1, 'total_cents' => 220000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 220000]],
        ])->assertForbidden();
    }

    public function test_an_alteration_is_sold_without_touching_stock(): void
    {
        $alteration = $this->product('Alteration', null, ['variant' => 'Shorten 2 m curtain', 'price_cents' => 25000]);

        $this->sell([
            'lines' => [['stock_item_id' => $alteration->id, 'quantity' => 1, 'total_cents' => 25000]],
            'payments' => [['method' => 'send_money', 'amount_cents' => 25000]],
        ])->assertCreated();

        $this->assertSame(0, StockItemMovement::where('stock_item_id', $alteration->id)->count());
    }

    public function test_price_hint_shows_what_this_customer_paid_last_time(): void
    {
        $lina = Customer::factory()->create(['name' => 'Lina']);
        $case = $this->product('Pillow case', 'White', ['price_cents' => 25000, 'opening_quantity' => 30]);
        $this->sell([
            'customer_id' => $lina->id,
            'lines' => [['stock_item_id' => $case->id, 'quantity' => 8, 'total_cents' => 176000]],
            'payments' => [['method' => 'send_money', 'amount_cents' => 176000]],
        ])->assertCreated();
        $this->sell([
            'lines' => [['stock_item_id' => $case->id, 'quantity' => 3, 'total_cents' => 75000]],
            'payments' => [['method' => 'cash', 'amount_cents' => 75000]],
        ])->assertCreated();

        $this->spa()->actingAs($this->cashier)->getJson("/api/sales/price-hint?stock_item_id={$case->id}&customer_id={$lina->id}")
            ->assertOk()
            ->assertJsonPath('data.customer_last.unit_cents', 22000)
            ->assertJsonPath('data.customer_last.quantity', 8)
            ->assertJsonPath('data.recent.0.unit_cents', 25000)
            ->assertJsonCount(2, 'data.recent');
    }

    private function sell(array $body): TestResponse
    {
        return $this->spa()->actingAs($this->cashier)->postJson('/api/sales', $body + ['payments' => []]);
    }
}
