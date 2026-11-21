<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\StockItem;
use App\Models\StockItemMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemTest extends TestCase
{
    use RefreshDatabase;

    public function test_receiving_hangers_creates_the_item_and_an_opening_movement(): void
    {
        $owner = $this->userWith(Role::Owner);

        $res = $this->spa()->actingAs($owner)->postJson('/api/stock-items', [
            'name' => 'Wooden hangers',
            'sku' => 'hng-01',
            'unit' => 'pcs',
            'quantity' => 200,
            'reorder_level' => 50,
            'cost_cents' => 1200000,
            'location' => 'Store',
            'notes' => 'Slim neck',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Wooden hangers')
            ->assertJsonPath('data.sku', 'HNG-01')
            ->assertJsonPath('data.quantity', 200)
            ->assertJsonPath('data.is_low', false)
            ->assertJsonPath('data.cost_cents', 1200000);

        $item = StockItem::findOrFail($res->json('data.id'));
        $movement = StockItemMovement::where('stock_item_id', $item->id)->sole();
        $this->assertSame('receipt', $movement->kind);
        $this->assertSame(200, $movement->change_qty);
        $this->assertSame(200, $movement->balance_after);
        $this->assertSame($owner->id, $movement->actor_id);
        $this->assertTrue(AuditEvent::where('action', 'stock_item.received')->where('entity_id', $item->id)->exists());
    }

    public function test_stock_items_are_listed_with_low_filter_and_search(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->receiveItem($owner, ['name' => 'Metal hangers', 'quantity' => 40, 'reorder_level' => 50]);
        $this->receiveItem($owner, ['name' => 'Zip rolls', 'quantity' => 20, 'reorder_level' => 5]);

        $this->spa()->actingAs($owner)->getJson('/api/stock-items')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->spa()->actingAs($owner)->getJson('/api/stock-items?low=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Metal hangers');

        $this->spa()->actingAs($owner)->getJson('/api/stock-items?q=zip')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Zip rolls');
    }

    public function test_only_owner_and_manager_can_receive_stock_and_costs_stay_private(): void
    {
        $item = $this->receiveItem($this->userWith(Role::Owner), ['cost_cents' => 50000]);

        foreach ([Role::Cashier, Role::Cutter, Role::Tailor] as $role) {
            $staff = $this->userWith($role);
            $this->spa()->actingAs($staff)->postJson('/api/stock-items', [
                'name' => 'Buttons', 'unit' => 'pcs', 'quantity' => 10, 'cost_cents' => 500,
            ])->assertForbidden();

            $this->spa()->actingAs($staff)->getJson('/api/stock-items')
                ->assertOk()
                ->assertJsonMissingPath('data.0.cost_cents')
                ->assertJsonMissingPath('data.0.supplier');
        }

        $this->assertSame(1, StockItem::count());

        $this->spa()->actingAs($this->userWith(Role::Cashier))->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('movements.0.change_qty', 25);
    }

    public function test_receipt_must_have_a_positive_quantity_and_known_unit(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->postJson('/api/stock-items', [
            'name' => 'Lining fabric', 'unit' => 'metres', 'quantity' => 0, 'cost_cents' => 0,
        ])->assertUnprocessable()->assertJsonValidationErrors(['unit', 'quantity']);
    }

    private function receiveItem(\App\Models\User $as, array $overrides = []): StockItem
    {
        $id = $this->spa()->actingAs($as)->postJson('/api/stock-items', array_merge([
            'name' => 'Buttons',
            'unit' => 'pcs',
            'quantity' => 25,
            'cost_cents' => 10000,
        ], $overrides))->assertCreated()->json('data.id');

        return StockItem::findOrFail($id);
    }
}
