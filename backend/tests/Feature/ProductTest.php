<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Colour;
use App\Models\ProductCategory;
use App\Models\StockItem;
use App\Models\StockItemMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_product_is_named_from_its_category_colour_and_variant_and_gets_opening_stock(): void
    {
        $owner = $this->userWith(Role::Owner);

        $res = $this->spa()->actingAs($owner)->postJson('/api/products', [
            'product_category_id' => ProductCategory::where('name', 'Window curtain')->value('id'),
            'colour_id' => Colour::firstOrCreate(['name' => 'Grey'])->id,
            'variant' => '  Blackout ',
            'price_cents' => 260000,
            'opening_quantity' => 12,
            'reorder_level' => 3,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Window curtain – Grey · Blackout')
            ->assertJsonPath('data.unit', 'set')
            ->assertJsonPath('data.quantity', 12)
            ->assertJsonPath('data.is_product', true)
            ->assertJsonPath('data.category.name', 'Window curtain');

        $movement = StockItemMovement::where('stock_item_id', $res->json('data.id'))->sole();
        $this->assertSame('receipt', $movement->kind);
        $this->assertSame(12, $movement->change_qty);
    }

    public function test_the_same_category_colour_and_variant_cannot_be_added_twice(): void
    {
        $this->product('Pillow case', 'White', ['variant' => 'Big size']);
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->postJson('/api/products', [
            'product_category_id' => ProductCategory::where('name', 'Pillow case')->value('id'),
            'colour_id' => Colour::where('name', 'White')->value('id'),
            'variant' => 'big SIZE',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['variant' => 'Pillow case – White · Big size is already in the list.']);
    }

    public function test_services_are_not_counted_and_cannot_take_opening_stock(): void
    {
        $owner = $this->userWith(Role::Owner);
        $alteration = ProductCategory::where('name', 'Alteration')->value('id');

        $this->spa()->actingAs($owner)->postJson('/api/products', [
            'product_category_id' => $alteration, 'opening_quantity' => 3,
        ])->assertUnprocessable()->assertJsonValidationErrors('opening_quantity');

        $this->spa()->actingAs($owner)->postJson('/api/products', [
            'product_category_id' => $alteration, 'variant' => 'Shorten', 'price_cents' => 25000,
        ])->assertCreated()->assertJsonPath('data.tracks_stock', false)->assertJsonPath('data.unit', 'job');
    }

    public function test_cashiers_see_products_but_cannot_add_them(): void
    {
        $this->product('Sheer', 'White');
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($cashier)->getJson('/api/products')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.price_cents', 220000)
            ->assertJsonMissingPath('data.0.cost_cents');

        $this->spa()->actingAs($cashier)->postJson('/api/products', [
            'product_category_id' => ProductCategory::where('name', 'Sheer')->value('id'),
        ])->assertForbidden();
    }

    public function test_products_are_kept_apart_from_supplies_in_the_stock_list(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->product('Pillow');
        $this->spa()->actingAs($owner)->postJson('/api/stock-items', [
            'name' => 'Curtain hooks', 'unit' => 'pack', 'quantity' => 5, 'cost_cents' => 0,
        ])->assertCreated();

        $this->spa()->actingAs($owner)->getJson('/api/stock-items?kind=supplies')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Curtain hooks');
    }

    public function test_more_stock_can_be_received_and_a_shelf_count_corrected(): void
    {
        $owner = $this->userWith(Role::Owner);
        $rod = $this->product('Curtain rod', null, ['variant' => '3 m gold']);

        $this->spa()->actingAs($owner)->postJson("/api/stock-items/{$rod->id}/receipts", ['quantity' => 10])
            ->assertOk()->assertJsonPath('data.quantity', 10);

        $this->spa()->actingAs($owner)->postJson("/api/stock-items/{$rod->id}/adjustments", ['counted' => 8, 'reason' => 'Two bent'])
            ->assertOk()->assertJsonPath('data.quantity', 8);

        $this->assertSame(['receipt', 'adjustment'], StockItemMovement::where('stock_item_id', $rod->id)->orderBy('id')->pluck('kind')->all());
        $this->assertSame(8, (int) StockItemMovement::where('stock_item_id', $rod->id)->sum('change_qty'));

        $this->spa()->actingAs($this->userWith(Role::Cashier))
            ->postJson("/api/stock-items/{$rod->id}/adjustments", ['counted' => 0, 'reason' => 'x'])
            ->assertForbidden();
    }

    public function test_a_product_price_can_be_changed_without_touching_its_stock(): void
    {
        $owner = $this->userWith(Role::Owner);
        $set = $this->product('Window curtain', 'Beige', ['opening_quantity' => 4]);

        $this->spa()->actingAs($owner)->patchJson("/api/products/{$set->id}", [
            'product_category_id' => $set->product_category_id,
            'colour_id' => $set->colour_id,
            'price_cents' => 250000,
        ])->assertOk()->assertJsonPath('data.price_cents', 250000)->assertJsonPath('data.quantity', 4);

        $this->assertSame(250000, StockItem::findOrFail($set->id)->price_cents);
    }
}
