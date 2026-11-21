<?php

namespace App\Support;

use App\Models\ShopRole;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Reads and cares for the roles table: five built-ins plus any the owner creates. */
final class RoleCatalog
{
    /** Labels keyed by role, memoised for the current request. */
    private static ?array $labels = null;

    /** @return Collection<int, ShopRole> */
    public static function all(): Collection
    {
        return ShopRole::query()->orderBy('position')->orderBy('label')->get();
    }

    public static function find(string $key): ?ShopRole
    {
        return ShopRole::query()->find($key);
    }

    public static function label(string $key): string
    {
        self::$labels ??= ShopRole::query()->pluck('label', 'key')->all();

        return self::$labels[$key] ?? Str::headline($key);
    }

    public static function flush(): void
    {
        self::$labels = null;
    }

    /** @return array<string, mixed> */
    public static function payload(ShopRole $role): array
    {
        return [
            'key' => $role->key,
            'label' => $role->label,
            'description' => $role->description,
            'builtin' => $role->builtin,
            'locked' => $role->full_access,
            'members' => $role->users()->count(),
            'permissions' => RolePermissions::forRole($role->key),
        ];
    }

    /** @param list<string> $permissions */
    public static function create(string $label, string $description, array $permissions): ShopRole
    {
        return DB::transaction(function () use ($label, $description, $permissions) {
            $key = self::uniqueKey($label);

            $role = ShopRole::create([
                'key' => $key,
                'label' => $label,
                'description' => $description,
                'builtin' => false,
                'full_access' => false,
                'position' => 100,
            ]);

            RolePermissions::sync($key, $permissions);
            self::flush();

            return $role;
        });
    }

    public static function update(ShopRole $role, string $label, string $description): ShopRole
    {
        $role->update(['label' => $label, 'description' => $description]);
        self::flush();

        return $role;
    }

    public static function delete(ShopRole $role): void
    {
        if ($role->builtin) {
            throw ValidationException::withMessages(['role' => 'Built-in roles cannot be deleted.']);
        }

        if (User::query()->where('role', $role->key)->exists()) {
            throw ValidationException::withMessages(['role' => 'Move the people in this role to another role first.']);
        }

        DB::transaction(function () use ($role) {
            RolePermissions::sync($role->key, []);
            $role->delete();
        });

        self::flush();
    }

    private static function uniqueKey(string $label): string
    {
        $base = Str::limit(Str::slug($label, '_'), 20, '') ?: 'role';
        $key = $base;
        $suffix = 2;

        while (ShopRole::query()->whereKey($key)->exists()) {
            $suffixText = '_'.$suffix++;
            $key = Str::limit($base, 20 - strlen($suffixText), '').$suffixText;
        }

        return $key;
    }
}
