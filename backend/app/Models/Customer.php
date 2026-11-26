<?php

namespace App\Models;

use App\Support\Phone;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A named buyer: a regular, or a neighbouring shop known by its stall code.
 * Walk-ins do not need an account; a sale's customer is optional.
 */
class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    protected $fillable = ['name', 'phone', 'stall', 'notes', 'active', 'created_by'];

    protected $attributes = ['active' => true, 'stall' => '', 'notes' => '', 'phone' => null];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function setNameAttribute(string $value): void
    {
        $this->attributes['name'] = CatalogueTerm::clean($value);
    }

    public function setStallAttribute(?string $value): void
    {
        $this->attributes['stall'] = CatalogueTerm::clean((string) $value);
    }

    public function setPhoneAttribute(?string $value): void
    {
        $this->attributes['phone'] = Phone::normalize($value);
    }

    /** @return HasMany<Sale, $this> */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
