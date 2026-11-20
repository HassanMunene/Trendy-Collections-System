<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/** Owner-only: create staff accounts, change roles, reset passwords, switch accounts off. */
class StaffController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('manage-staff');

        return UserResource::collection(User::orderByDesc('active')->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage-staff');
        $data = $this->validated($request);

        $user = User::create($data + ['must_change_password' => true, 'active' => true]);
        Audit::record($request->user(), 'staff.created', $user, ['username' => $user->username, 'role' => $user->role->value]);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function update(Request $request, User $staff): UserResource
    {
        Gate::authorize('manage-staff');
        $this->guardTarget($request->user(), $staff);
        $data = $this->validated($request, $staff);
        unset($data['password']);

        return DB::transaction(function () use ($request, $staff, $data) {
            if ($staff->role === Role::Owner && $data['role'] !== Role::Owner->value) {
                $this->ensureAnotherOwner($staff);
            }
            $before = $staff->only(['name', 'username', 'phone', 'role']);
            $staff->update($data);
            Audit::record($request->user(), 'staff.updated', $staff, [
                'before' => array_map(fn ($v) => $v instanceof Role ? $v->value : $v, $before),
                'after' => $staff->only(['name', 'username', 'phone']) + ['role' => $staff->role->value],
            ]);

            return new UserResource($staff);
        });
    }

    /** Owner sets a temporary password; the staff member must change it on next sign-in. */
    public function resetPassword(Request $request, User $staff): JsonResponse
    {
        Gate::authorize('manage-staff');
        $this->guardTarget($request->user(), $staff);

        $temporary = Str::password(10, symbols: false);
        $staff->forceFill(['password' => $temporary, 'must_change_password' => true])->save();
        // Sign the person out everywhere.
        DB::table('sessions')->where('user_id', $staff->id)->delete();
        Audit::record($request->user(), 'staff.password_reset', $staff);

        return response()->json(['data' => ['temporary_password' => $temporary]]);
    }

    public function setActive(Request $request, User $staff): UserResource
    {
        Gate::authorize('manage-staff');
        $this->guardTarget($request->user(), $staff);
        $active = $request->validate(['active' => ['required', 'boolean']])['active'];

        if ($staff->is($request->user()) && ! $active) {
            throw ValidationException::withMessages(['active' => 'You cannot switch off your own account.']);
        }

        return DB::transaction(function () use ($request, $staff, $active) {
            if (! $active && $staff->role === Role::Owner) {
                $this->ensureAnotherOwner($staff);
            }
            $staff->forceFill(['active' => $active])->save();
            if (! $active) {
                DB::table('sessions')->where('user_id', $staff->id)->delete();
            }
            Audit::record($request->user(), $active ? 'staff.activated' : 'staff.deactivated', $staff);

            return new UserResource($staff);
        });
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?User $existing = null): array
    {
        $request->merge([
            'username' => is_string($request->input('username')) ? trim($request->input('username')) : $request->input('username'),
            'phone' => Phone::normalize($request->input('phone')) ?? $request->input('phone'),
        ]);

        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')->ignore($existing)],
            'phone' => ['nullable', 'string', 'regex:/^254[17]\d{8}$/', Rule::unique('users', 'phone')->ignore($existing)],
            'role' => ['required', Rule::enum(Role::class)],
            'password' => $existing ? ['prohibited'] : ['required', 'string', Password::min(8)],
        ], [
            'username.regex' => 'Use letters, numbers, dots, dashes or underscores only.',
            'phone.regex' => 'Enter a Kenyan mobile number like 0712 345 678.',
        ]);
    }

    /** Ordinary owners cannot change the superadmin account. */
    private function guardTarget(User $actor, User $target): void
    {
        if ($target->is_superadmin && ! $actor->is_superadmin) {
            abort(403, 'Only the superadmin can change this account.');
        }
    }

    private function ensureAnotherOwner(User $leaving): void
    {
        $others = User::where('role', Role::Owner->value)->where('active', true)
            ->whereKeyNot($leaving->id)->lockForUpdate()->pluck('id')->count(); // FOR UPDATE cannot wrap COUNT() in Postgres
        if ($others === 0) {
            throw ValidationException::withMessages(['role' => 'The shop must keep at least one active owner.']);
        }
    }
}
