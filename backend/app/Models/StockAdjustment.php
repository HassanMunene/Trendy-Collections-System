<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class StockAdjustment extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['roll_id', 'before_cm', 'after_cm', 'reason', 'actor_id'];

    protected function casts(): array
    {
        return ['before_cm' => 'integer', 'after_cm' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Stock adjustments cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Stock adjustments cannot be deleted.'));
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
