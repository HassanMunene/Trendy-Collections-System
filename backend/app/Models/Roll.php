<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One physical roll. balance_cm is maintained only by App\Services\StockLedger
 * and always equals the sum of this roll's stock movements.
 */
class Roll extends Model
{
    protected $fillable = [
        'tag', 'fabric_id', 'supplier_id', 'stated_cm', 'received_cm', 'balance_cm', 'cost_cents',
        'dye_lot', 'invoice_ref', 'purchase_date', 'location', 'included_services',
        'remnant_alert_cm', 'notes', 'status', 'received_by',
    ];

    protected $attributes = [
        'status' => 'active',
        'location' => 'Main shop',
        'dye_lot' => '',
        'invoice_ref' => '',
        'included_services' => '',
        'notes' => '',
        'supplier_id' => null,
        'stated_cm' => null,
        'cost_cents' => 0,
        'purchase_date' => null,
        'remnant_alert_cm' => null,
    ];

    protected function casts(): array
    {
        return [
            'stated_cm' => 'integer',
            'received_cm' => 'integer',
            'balance_cm' => 'integer',
            'cost_cents' => 'integer',
            'remnant_alert_cm' => 'integer',
            'purchase_date' => 'date',
        ];
    }

    /** @return BelongsTo<Fabric, $this> */
    public function fabric(): BelongsTo
    {
        return $this->belongsTo(Fabric::class);
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<User, $this> */
    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    /** @return HasMany<StockMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /** @return HasMany<StockAdjustment, $this> */
    public function adjustments(): HasMany
    {
        return $this->hasMany(StockAdjustment::class);
    }

    /** Low: at or below the roll's own alert, or the fabric's reorder threshold. */
    public function isLow(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }
        $threshold = $this->remnant_alert_cm ?? $this->fabric?->reorder_threshold_cm;

        return $threshold !== null && $this->balance_cm <= $threshold;
    }

    /** @param Builder<Roll> $query */
    public function scopeLow(Builder $query): void
    {
        $query->where('rolls.status', 'active')->where(function (Builder $q) {
            $q->whereColumn('rolls.balance_cm', '<=', 'rolls.remnant_alert_cm')
                ->orWhere(function (Builder $q) {
                    $q->whereNull('rolls.remnant_alert_cm')->whereExists(function ($sub) {
                        $sub->selectRaw('1')->from('fabrics')
                            ->whereColumn('fabrics.id', 'rolls.fabric_id')
                            ->whereNotNull('fabrics.reorder_threshold_cm')
                            ->whereColumn('rolls.balance_cm', '<=', 'fabrics.reorder_threshold_cm');
                    });
                });
        });
    }
}
