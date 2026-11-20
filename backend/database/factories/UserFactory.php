<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'username' => fake()->unique()->userName(),
            'phone' => null,
            'role' => Role::Cashier->value,
            'active' => true,
            'must_change_password' => false,
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    public function role(Role $role): static
    {
        return $this->state(fn () => ['role' => $role->value]);
    }

    public function owner(): static
    {
        return $this->role(Role::Owner);
    }

    public function superadmin(): static
    {
        return $this->owner()->afterMaking(fn (User $u) => $u->is_superadmin = true);
    }
}
