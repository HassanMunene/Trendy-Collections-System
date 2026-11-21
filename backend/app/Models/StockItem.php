<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Stock the shop keeps that is not a fabric roll (hangers, trims, lining...).
 * quantity is maintained only when posting a StockItemMovement, so it always
 * equals the sum of this item's movements.
 */
class StockItem extends Model
{
    protected $fillable = [
        'name', 'sku', 'unit', 'quantity', 'reorder_level', 'cost_cents',
        'supplier_id', 'location', 'notes', 'active', 'received_by',
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
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'reorder_level' => 'integer',
            'cost_cents' => 'integer',
            'active' => 'boolean',
        ];
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
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
        return $this->active && $this->reorder_level !== null && $this->quantity <= $this->reorder_level;
    }

    /** @param Builder<StockItem> $query */
    public function scopeLow(Builder $query): void
    {
        $query->where('stock_items.active', true)
            ->whereNotNull('stock_items.reorder_level')
            ->whereColumn('stock_items.quantity', '<=', 'stock_items.reorder_level');
    }
}
