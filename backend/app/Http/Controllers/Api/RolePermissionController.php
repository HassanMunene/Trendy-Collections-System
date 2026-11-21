<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit;
use App\Support\Permission;
use App\Support\RoleCatalog;
use App\Support\RolePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Owner-only: choose which shop permissions each role gets, built-in or custom. */
class RolePermissionController extends Controller
{
    public function index(): JsonResponse
    {
        Gate::authorize('manage-staff');

        return response()->json(['data' => [
            'permissions' => array_map(
                fn (string $key) => ['key' => $key] + Permission::DETAILS[$key],
                Permission::all(),
            ),
            'roles' => RoleCatalog::all()->map(fn ($role) => RoleCatalog::payload($role))->all(),
        ]]);
    }

    public function update(Request $request, string $role): JsonResponse
    {
        Gate::authorize('manage-staff');
        $target = RoleCatalog::find($role) ?? abort(404);

        if ($target->full_access) {
            throw ValidationException::withMessages(['role' => 'The owner role always has full access.']);
        }

        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(Permission::ASSIGNABLE)],
        ], [
            'permissions.*.in' => 'Managing users and reading the audit log stay with owners.',
        ]);

        $before = RolePermissions::forRole($target->key);
        RolePermissions::sync($target->key, $data['permissions']);
        Audit::record($request->user(), 'role.permissions_updated', 'role_permissions', [
            'role' => $target->key,
            'before' => $before,
            'after' => $data['permissions'],
        ]);

        return response()->json(['data' => RoleCatalog::payload($target->fresh())]);
    }
}
