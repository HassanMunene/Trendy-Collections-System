<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/** Append-only. The database trigger rejects updates and deletes as well. */
class StockMovement extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['roll_id', 'change_cm', 'balance_after_cm', 'kind', 'reference_type', 'reference_id', 'actor_id', 'note'];

    protected function casts(): array
    {
        return ['change_cm' => 'integer', 'balance_after_cm' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Stock movements cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Stock movements cannot be deleted.'));
    }

    /** @return BelongsTo<Roll, $this> */
    public function roll(): BelongsTo
    {
        return $this->belongsTo(Roll::class);
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
