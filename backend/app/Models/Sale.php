<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One customer basket: what was sold and how it was paid. A posted sale is never edited;
 * the only change allowed (and enforced by a database trigger) is voiding it with a reason.
 */
class Sale extends Model
{
    protected $fillable = [
        'number', 'customer_id', 'approval_id', 'customer_name', 'total_cents', 'note', 'status',
        'sold_by', 'voided_by', 'voided_at', 'void_reason',
    ];

    protected $attributes = ['customer_name' => '', 'note' => '', 'status' => 'posted', 'void_reason' => ''];

    protected function casts(): array
    {
        return ['total_cents' => 'integer', 'voided_at' => 'datetime'];
    }

    public function isVoided(): bool
    {
        return $this->status === 'voided';
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sold_by');
    }

    /** @return BelongsTo<User, $this> */
    public function voider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }

    /** @return HasMany<SaleLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(SaleLine::class)->orderBy('id');
    }

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    /** @return HasMany<SaleReturn, $this> */
    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class)->orderBy('id');
    }

    /** @return BelongsTo<Approval, $this> */
    public function approval(): BelongsTo
    {
        return $this->belongsTo(Approval::class);
    }

    /** @param Builder<Sale> $query */
    public function scopePosted(Builder $query): void
    {
        $query->where('sales.status', 'posted');
    }
}
