<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/**
 * One piece of sewing for the shelf: the roll metres a tailor used and the finished goods made.
 * Append-only; a mistake is put right with a stock count correction.
 */
class SewingBatch extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['sewn_by', 'recorded_by', 'note'];

    protected $attributes = ['note' => ''];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Sewing records cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Sewing records cannot be deleted.'));
    }

    /** @return BelongsTo<User, $this> */
    public function tailor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sewn_by');
    }

    /** @return BelongsTo<User, $this> */
    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /** @return HasMany<SewingBatchInput, $this> */
    public function inputs(): HasMany
    {
        return $this->hasMany(SewingBatchInput::class)->orderBy('id');
    }

    /** @return HasMany<SewingBatchOutput, $this> */
    public function outputs(): HasMany
    {
        return $this->hasMany(SewingBatchOutput::class)->orderBy('id');
    }
}
