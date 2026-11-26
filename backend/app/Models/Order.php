<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A made-to-measure job: taken (often with a deposit) -> in work -> ready -> collected.
 * What has been paid is the sum of its payments that are not voided; the rest is the balance.
 */
class Order extends Model
{
    public const STATUSES = [
        'taken' => 'Taken',
        'in_work' => 'In work',
        'ready' => 'Ready',
        'collected' => 'Collected',
        'cancelled' => 'Cancelled',
    ];

    public const ACTIVE = ['taken', 'in_work', 'ready'];

    protected $fillable = [
        'number', 'customer_id', 'status', 'due_on', 'total_cents', 'note', 'created_by',
        'started_at', 'ready_at', 'collected_at', 'cancelled_at', 'cancelled_by', 'cancel_reason',
        'refund_method', 'refund_cents',
    ];

    protected $attributes = ['status' => 'taken', 'note' => '', 'cancel_reason' => '', 'refund_cents' => 0];

    protected function casts(): array
    {
        return [
            'due_on' => 'date',
            'total_cents' => 'integer',
            'refund_cents' => 'integer',
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
            'collected_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function isActive(): bool
    {
        return in_array($this->status, self::ACTIVE, true);
    }

    public function isOverdue(): bool
    {
        return in_array($this->status, ['taken', 'in_work'], true) && $this->due_on->lt(now('Africa/Nairobi')->startOfDay());
    }

    public function paidCents(): int
    {
        return (int) $this->payments()->whereNull('voided_at')->sum('amount_cents');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<User, $this> */
    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    /** @return HasMany<OrderLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class)->orderBy('id');
    }

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    /** @param Builder<Order> $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('orders.status', self::ACTIVE);
    }
}
