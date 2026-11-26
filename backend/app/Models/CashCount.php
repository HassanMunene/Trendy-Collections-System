<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * The drawer counted at closing: what the system expected, what was really there, and how much
 * was left in the drawer for tomorrow. A recount adds a new row; the latest one for a day counts.
 */
class CashCount extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['business_date', 'expected_cents', 'counted_cents', 'kept_cents', 'note', 'counted_by'];

    protected $attributes = ['note' => ''];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'expected_cents' => 'integer',
            'counted_cents' => 'integer',
            'kept_cents' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Cash counts cannot be edited; count again.'));
        static::deleting(fn () => throw new LogicException('Cash counts cannot be deleted.'));
    }

    /** @return BelongsTo<User, $this> */
    public function counter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }
}
