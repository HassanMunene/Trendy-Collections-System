<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/** Fabric from a roll, a finished product, or priced work (sewing, delivery, fitting). Append-only. */
class OrderLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['order_id', 'kind', 'roll_id', 'length_cm', 'stock_item_id', 'quantity', 'description', 'total_cents'];

    protected function casts(): array
    {
        return ['length_cm' => 'integer', 'quantity' => 'integer', 'total_cents' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Order lines cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Order lines cannot be deleted.'));
    }

    /** @return BelongsTo<Roll, $this> */
    public function roll(): BelongsTo
    {
        return $this->belongsTo(Roll::class);
    }

    /** @return BelongsTo<StockItem, $this> */
    public function stockItem(): BelongsTo
    {
        return $this->belongsTo(StockItem::class);
    }
}
