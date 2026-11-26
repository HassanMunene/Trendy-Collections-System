<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/** Goods brought back from a sale, and how the customer was paid back. Append-only. */
class SaleReturn extends Model
{
    public const UPDATED_AT = null;

    /** How a return is paid back, in the shop's words. */
    public const REFUND_METHODS = [
        'cash' => 'Cash back',
        'send_money' => 'Sent back by M-Pesa',
        'paybill' => 'Paybill refund',
        'account' => 'Taken off what they owe',
        'none' => 'No refund (exchange)',
    ];

    protected $fillable = ['number', 'sale_id', 'refund_method', 'refund_cents', 'reason', 'created_by'];

    protected function casts(): array
    {
        return ['refund_cents' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Returns cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Returns cannot be deleted.'));
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<SaleReturnLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(SaleReturnLine::class)->orderBy('id');
    }
}
