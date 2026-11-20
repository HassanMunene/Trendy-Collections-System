<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A fabric design/SKU: what a roll is made of. Many physical rolls can share one fabric. */
class Fabric extends Model
{
    public const OPACITIES = ['', 'sheer', 'light_filtering', 'dim_out', 'blackout'];

    protected $fillable = [
        'code', 'fabric_category_id', 'material_type_id', 'texture_id', 'colour_id',
        'design', 'shade_code', 'opacity', 'width_cm', 'weight_gsm', 'care_instructions',
        'retail_price_cents_per_m', 'reorder_threshold_cm', 'active', 'created_by',
    ];

    protected $attributes = [
        'active' => true,
        'design' => '',
        'shade_code' => '',
        'opacity' => '',
        'care_instructions' => '',
        'width_cm' => null,
        'weight_gsm' => null,
        'retail_price_cents_per_m' => null,
        'reorder_threshold_cm' => null,
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'width_cm' => 'integer',
            'weight_gsm' => 'integer',
            'retail_price_cents_per_m' => 'integer',
            'reorder_threshold_cm' => 'integer',
        ];
    }

    /** @return BelongsTo<FabricCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(FabricCategory::class, 'fabric_category_id');
    }

    /** @return BelongsTo<MaterialType, $this> */
    public function materialType(): BelongsTo
    {
        return $this->belongsTo(MaterialType::class);
    }

    /** @return BelongsTo<Texture, $this> */
    public function texture(): BelongsTo
    {
        return $this->belongsTo(Texture::class);
    }

    /** @return BelongsTo<Colour, $this> */
    public function colour(): BelongsTo
    {
        return $this->belongsTo(Colour::class);
    }

    /** @return HasMany<Roll, $this> */
    public function rolls(): HasMany
    {
        return $this->hasMany(Roll::class);
    }

    /** Short human name, e.g. "Cream woven linen · Damask". */
    public function displayName(): string
    {
        $name = trim("{$this->colour?->name} {$this->texture?->name} {$this->materialType?->name}");

        return $this->design !== '' ? "{$name} · {$this->design}" : $name;
    }
}
