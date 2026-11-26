<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Goods given to a neighbouring shop on approval (sale-or-return). They may keep them for at
 * most a week (Mum, 25 Nov 2026); each item comes back to the shelf or becomes a sale.
 */
class Approval extends Model
{
    public const MAX_DAYS = 7;

    protected $fillable = ['number', 'customer_id', 'status', 'due_on', 'note', 'created_by', 'closed_at'];

    protected $attributes = ['status' => 'open', 'note' => ''];

    protected function casts(): array
    {
        return ['due_on' => 'date', 'closed_at' => 'datetime'];
    }

    public function isOverdue(): bool
    {
        return $this->status === 'open' && $this->due_on->lt(now('Africa/Nairobi')->startOfDay());
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

    /** @return HasMany<ApprovalLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(ApprovalLine::class)->orderBy('id');
    }

    /** @return HasMany<Sale, $this> */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class)->orderBy('id');
    }

    /** @param Builder<Approval> $query */
    public function scopeOpen(Builder $query): void
    {
        $query->where('approvals.status', 'open');
    }
}
