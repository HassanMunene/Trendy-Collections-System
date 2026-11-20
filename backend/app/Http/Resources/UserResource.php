<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'phone' => $this->phone,
            'role' => $this->role->value,
            'is_superadmin' => $this->is_superadmin,
            'active' => $this->active,
            'must_change_password' => $this->must_change_password,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** The signed-in user plus what they are allowed to do, for the app shell. */
    public static function me(User $user): array
    {
        return (new self($user))->resolve() + [
            'permissions' => [
                'manage_staff' => Gate::forUser($user)->allows('manage-staff'),
                'manage_catalogue' => Gate::forUser($user)->allows('manage-catalogue'),
                'receive_stock' => Gate::forUser($user)->allows('receive-stock'),
                'adjust_stock' => Gate::forUser($user)->allows('adjust-stock'),
                'view_costs' => Gate::forUser($user)->allows('view-costs'),
            ],
        ];
    }
}
