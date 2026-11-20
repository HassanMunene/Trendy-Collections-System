<?php

namespace App\Models;

use App\Support\Phone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    protected $fillable = ['name', 'phone', 'building', 'stall', 'notes', 'active'];

    protected $attributes = ['active' => true, 'building' => '', 'stall' => '', 'notes' => '', 'phone' => null];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function setNameAttribute(string $value): void
    {
        $this->attributes['name'] = CatalogueTerm::clean($value);
    }

    public function setPhoneAttribute(?string $value): void
    {
        $this->attributes['phone'] = Phone::normalize($value);
    }

    /** @return HasMany<Roll, $this> */
    public function rolls(): HasMany
    {
        return $this->hasMany(Roll::class);
    }
}
