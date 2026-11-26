<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Stock the shop keeps that is not a fabric roll. With a product category it is a finished
 * good for sale (a grey window curtain, a big pillow case); without one it is a supply
 * (hangers, trims, lining). quantity is maintained only when posting a StockItemMovement,
 * so it always equals the sum of this item's movements.
 */
class StockItem extends Model
{
    protected $fillable = [
        'name', 'sku', 'unit', 'quantity', 'reorder_level', 'cost_cents',
        'supplier_id', 'location', 'notes', 'active', 'received_by',
        'product_category_id', 'colour_id', 'variant', 'price_cents', 'tracks_stock',
    ];

    protected $attributes = [
        'unit' => 'pcs',
        'quantity' => 0,
        'cost_cents' => 0,
        'location' => 'Main shop',
        'notes' => '',
        'active' => true,
        'reorder_level' => null,
        'supplier_id' => null,
        'sku' => null,
        'product_category_id' => null,
        'colour_id' => null,
        'variant' => '',
        'price_cents' => null,
        'tracks_stock' => true,
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'reorder_level' => 'integer',
            'cost_cents' => 'integer',
            'price_cents' => 'integer',
            'tracks_stock' => 'boolean',
            'active' => 'boolean',
        ];
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<ProductCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    /** @return BelongsTo<Colour, $this> */
    public function colour(): BelongsTo
    {
        return $this->belongsTo(Colour::class);
    }

    public function isProduct(): bool
    {
        return $this->product_category_id !== null;
    }

    public function setVariantAttribute(?string $value): void
    {
        $this->attributes['variant'] = CatalogueTerm::clean((string) $value);
    }

    /** @return BelongsTo<User, $this> */
    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    /** @return HasMany<StockItemMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(StockItemMovement::class);
    }

    public function isLow(): bool
    {
        return $this->active && $this->tracks_stock && $this->reorder_level !== null && $this->quantity <= $this->reorder_level;
    }

    /** @param Builder<StockItem> $query */
    public function scopeProducts(Builder $query): void
    {
        $query->whereNotNull('stock_items.product_category_id');
    }

    /** @param Builder<StockItem> $query */
    public function scopeSupplies(Builder $query): void
    {
        $query->whereNull('stock_items.product_category_id');
    }

    /** @param Builder<StockItem> $query */
    public function scopeLow(Builder $query): void
    {
        $query->where('stock_items.active', true)
            ->where('stock_items.tracks_stock', true)
            ->whereNotNull('stock_items.reorder_level')
            ->whereColumn('stock_items.quantity', '<=', 'stock_items.reorder_level');
    }
}
