<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared behaviour for the small controlled lists (category, material type, texture, colour).
 * Names are trimmed and inner whitespace collapsed so "Cream " cannot duplicate "Cream".
 */
abstract class CatalogueTerm extends Model
{
    protected $fillable = ['name', 'active'];

    protected $attributes = ['active' => true];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function setNameAttribute(string $value): void
    {
        $this->attributes['name'] = self::clean($value);
    }

    public static function clean(string $value): string
    {
        return trim(preg_replace('/\s+/', ' ', $value) ?? '');
    }

    /** @param Builder<static> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }
}
