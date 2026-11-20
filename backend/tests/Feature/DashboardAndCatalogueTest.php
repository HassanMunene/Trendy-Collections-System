<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Colour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardAndCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_totals_and_low_stock(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->receivedRoll($owner);
        $this->receivedRoll($owner, ['received_cm' => 300, 'stated_cm' => 300, 'remnant_alert_cm' => 500, 'cost_cents' => 100000]);

        $this->spa()->actingAs($owner)->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('data.active_rolls', 2)
            ->assertJsonPath('data.balance_cm', 5300)
            ->assertJsonPath('data.by_category.0.balance_cm', 5300)
            ->assertJsonPath('data.received_this_week.rolls', 2)
            ->assertJsonCount(1, 'data.low_rolls')
            ->assertJsonPath('data.low_rolls.0.balance_cm', 300)
            ->assertJsonPath('data.stock_value_cents', 2100000);

        $this->spa()->actingAs($owner)->getJson('/api/rolls?low=1')->assertJsonCount(1, 'data');

        $cashierView = $this->spa()->actingAs($this->userWith(Role::Cashier))->getJson('/api/dashboard')->assertOk();
        $this->assertArrayNotHasKey('stock_value_cents', $cashierView->json('data'));
    }

    public function test_adding_a_colour_reuses_existing_spelling(): void
    {
        $owner = $this->userWith(Role::Owner);
        Colour::create(['name' => 'Cream']);

        $this->spa()->actingAs($owner)->postJson('/api/lookups/colours', ['name' => '  cream  '])
            ->assertOk()->assertJsonPath('data.name', 'Cream');
        $this->spa()->actingAs($owner)->postJson('/api/lookups/colours', ['name' => 'Dusty   Rose'])
            ->assertCreated()->assertJsonPath('data.name', 'Dusty Rose');
        $this->assertSame(2, Colour::count());

        $this->spa()->actingAs($this->userWith(Role::Tailor))->postJson('/api/lookups/colours', ['name' => 'Teal'])
            ->assertForbidden();
    }

    public function test_fabric_list_shows_stock_totals(): void
    {
        $owner = $this->userWith(Role::Owner);
        $first = $this->receivedRoll($owner);
        $payload = $this->newRollPayload(['received_cm' => 1000]);
        unset($payload['fabric']);
        $payload['fabric_id'] = $first->fabric_id;
        $this->spa()->actingAs($owner)->postJson('/api/rolls', $payload)->assertCreated();

        $this->spa()->actingAs($owner)->getJson('/api/fabrics')->assertOk()
            ->assertJsonPath('data.0.rolls_in_stock', 2)
            ->assertJsonPath('data.0.balance_cm', 6000);
    }
}
