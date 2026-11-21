<?php

namespace App\Support;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Links any role (built-in or custom) to the permissions stored in `role_permissions`. */
final class RolePermissions
{
    /** @return list<string> */
    public static function forRole(string $role): array
    {
        // The owner role is never limited, whatever rows exist.
        if ($role === Role::Owner->value) {
            return Permission::all();
        }

        return DB::table('role_permissions')
            ->where('role', $role)
            ->pluck('permission')
            ->all();
    }

    public static function allows(User $user, string $permission): bool
    {
        // Owner-only permissions are refused even if a stray row says otherwise.
        if (in_array($permission, Permission::OWNER_ONLY, true) && $user->role !== Role::Owner->value) {
            return false;
        }

        return in_array($permission, self::forRole($user->role), true);
    }

    /** @param list<string> $permissions */
    public static function sync(string $role, array $permissions): void
    {
        $permissions = array_values(array_unique($permissions));

        DB::transaction(function () use ($role, $permissions) {
            DB::table('role_permissions')->where('role', $role)->delete();

            if ($permissions === []) {
                return;
            }

            $now = now();
            DB::table('role_permissions')->insert(array_map(fn (string $permission) => [
                'role' => $role,
                'permission' => $permission,
                'created_at' => $now,
                'updated_at' => $now,
            ], $permissions));
        });
    }
}
