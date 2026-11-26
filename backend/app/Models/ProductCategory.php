<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** What the shop sells: window curtain (set), door curtain, sheer, pillow case... and its counting unit. */
class ProductCategory extends Model
{
    protected $fillable = ['name', 'unit', 'tracks_stock', 'sort_order', 'active'];

    protected $attributes = ['tracks_stock' => true, 'sort_order' => 0, 'active' => true];

    protected function casts(): array
    {
        return ['tracks_stock' => 'boolean', 'sort_order' => 'integer', 'active' => 'boolean'];
    }

    public function setNameAttribute(string $value): void
    {
        $this->attributes['name'] = CatalogueTerm::clean($value);
    }

    /** @return HasMany<StockItem, $this> */
    public function products(): HasMany
    {
        return $this->hasMany(StockItem::class);
    }

    /** @param Builder<ProductCategory> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }
}
