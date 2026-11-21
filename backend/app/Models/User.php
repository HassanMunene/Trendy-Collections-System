<?php

namespace App\Models;

use App\Enums\Role;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'username', 'phone', 'avatar_path', 'role', 'active', 'must_change_password', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /** Defaults so a freshly created model matches what the database would return. */
    protected $attributes = [
        'is_superadmin' => false,
        'active' => true,
        'must_change_password' => false,
        'phone' => null,
        'avatar_path' => null,
        'last_login_at' => null,
    ];

    protected function casts(): array
    {
        return [
            'is_superadmin' => 'boolean',
            'active' => 'boolean',
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function hasRole(Role|string ...$roles): bool
    {
        foreach ($roles as $role) {
            if ($this->role === ($role instanceof Role ? $role->value : $role)) {
                return true;
            }
        }

        return false;
    }

    public function isOwner(): bool
    {
        return $this->hasRole(Role::Owner);
    }

    public function isOwnerOrManager(): bool
    {
        return $this->hasRole(Role::Owner, Role::Manager);
    }

    /** @param Builder<User> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }
}
