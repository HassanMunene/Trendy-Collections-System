<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/** Append-only. The database trigger rejects updates and deletes as well. */
class SaleLine extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'sale_id', 'kind', 'stock_item_id', 'roll_id', 'description', 'quantity', 'length_cm',
        'unit', 'asking_unit_cents', 'total_cents',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'length_cm' => 'integer',
            'asking_unit_cents' => 'integer',
            'total_cents' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Sale lines cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Sale lines cannot be deleted.'));
    }

    /**
     * What the line would have cost at the asking price, or null when there was none.
     * Fabric asking prices are per metre; lengths are in centimetres.
     */
    public function askingTotalCents(): ?int
    {
        if ($this->asking_unit_cents === null) {
            return null;
        }

        return $this->kind === 'fabric'
            ? intdiv($this->asking_unit_cents * $this->length_cm + 50, 100)
            : $this->asking_unit_cents * $this->quantity;
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<StockItem, $this> */
    public function stockItem(): BelongsTo
    {
        return $this->belongsTo(StockItem::class);
    }

    /** @return BelongsTo<Roll, $this> */
    public function roll(): BelongsTo
    {
        return $this->belongsTo(Roll::class);
    }
}
