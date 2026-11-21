<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ShopRole;
use App\Services\Audit;
use App\Support\Permission;
use App\Support\RoleCatalog;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Owner-only: add, rename and remove custom roles. The five built-ins are protected. */
class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        Gate::authorize('manage-staff');

        return response()->json(['data' => RoleCatalog::all()
            ->map(fn (ShopRole $role) => ['key' => $role->key, 'label' => $role->label, 'builtin' => $role->builtin, 'locked' => $role->full_access])
            ->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage-staff');
        $data = $request->validate([
            'label' => ['required', 'string', 'max:40', $this->labelIsFree()],
            'description' => ['nullable', 'string', 'max:200'],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(Permission::ASSIGNABLE)],
        ], [
            'permissions.*.in' => 'Managing users and reading the audit log stay with owners.',
        ]);

        $role = RoleCatalog::create(trim($data['label']), trim((string) ($data['description'] ?? '')), $data['permissions']);
        Audit::record($request->user(), 'role.created', 'roles', [
            'role' => $role->key,
            'label' => $role->label,
            'permissions' => $data['permissions'],
        ]);

        return response()->json(['data' => RoleCatalog::payload($role)], 201);
    }

    public function update(Request $request, string $role): JsonResponse
    {
        Gate::authorize('manage-staff');
        $target = RoleCatalog::find($role) ?? abort(404);

        if ($target->builtin) {
            throw ValidationException::withMessages(['role' => 'Built-in roles cannot be renamed. You can change their permissions instead.']);
        }

        $data = $request->validate([
            'label' => ['required', 'string', 'max:40', $this->labelIsFree($target)],
            'description' => ['nullable', 'string', 'max:200'],
        ]);

        $before = ['label' => $target->label, 'description' => $target->description];
        $target = RoleCatalog::update($target, trim($data['label']), trim((string) ($data['description'] ?? '')));
        Audit::record($request->user(), 'role.updated', 'roles', [
            'role' => $target->key,
            'before' => $before,
            'after' => ['label' => $target->label, 'description' => $target->description],
        ]);

        return response()->json(['data' => RoleCatalog::payload($target)]);
    }

    public function destroy(Request $request, string $role): JsonResponse
    {
        Gate::authorize('manage-staff');
        $target = RoleCatalog::find($role) ?? abort(404);

        RoleCatalog::delete($target);
        Audit::record($request->user(), 'role.deleted', 'roles', ['role' => $target->key, 'label' => $target->label]);

        return response()->json(['ok' => true]);
    }

    /** Role names are case-insensitive, so "Stock keeper" and "stock KEEPER" clash. */
    private function labelIsFree(?ShopRole $ignore = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($ignore) {
            $exists = ShopRole::query()
                ->whereRaw('lower(label) = ?', [mb_strtolower(trim((string) $value))])
                ->when($ignore, fn ($query) => $query->whereKeyNot($ignore->key))
                ->exists();

            if ($exists) {
                $fail('A role with this name already exists.');
            }
        };
    }
}
