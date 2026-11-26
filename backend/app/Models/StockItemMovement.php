<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/** Append-only. The database trigger rejects updates and deletes as well. */
class StockItemMovement extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['stock_item_id', 'change_qty', 'balance_after', 'kind', 'reference_type', 'reference_id', 'note', 'actor_id'];

    protected function casts(): array
    {
        return ['change_qty' => 'integer', 'balance_after' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Stock movements cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Stock movements cannot be deleted.'));
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
