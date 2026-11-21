<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A role accounts can be given. Five are built in; owners may add their own. */
class ShopRole extends Model
{
    protected $table = 'roles';

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'label', 'description', 'builtin', 'full_access', 'position'];

    protected function casts(): array
    {
        return ['builtin' => 'boolean', 'full_access' => 'boolean'];
    }

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    /** @return HasMany<User, $this> */
    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role', 'key');
    }
}
