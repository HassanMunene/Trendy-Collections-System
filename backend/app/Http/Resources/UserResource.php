<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Support\RoleCatalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

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
            'avatar_url' => $this->avatar_path ? Storage::disk('public')->url($this->avatar_path) : null,
            'role' => $this->role,
            'role_label' => RoleCatalog::label($this->role),
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
            // The React app logs itself out after this much inactivity, in step with the server.
            'session_lifetime_seconds' => ((int) config('session.lifetime')) * 60,
            'permissions' => [
                'manage_staff' => Gate::forUser($user)->allows('manage-staff'),
                'manage_catalogue' => Gate::forUser($user)->allows('manage-catalogue'),
                'receive_stock' => Gate::forUser($user)->allows('receive-stock'),
                'adjust_stock' => Gate::forUser($user)->allows('adjust-stock'),
                'view_costs' => Gate::forUser($user)->allows('view-costs'),
                'view_audit' => Gate::forUser($user)->allows('view-audit'),
                'sell' => Gate::forUser($user)->allows('sell'),
                'void_sales' => Gate::forUser($user)->allows('void-sales'),
                'record_sewing' => Gate::forUser($user)->allows('record-sewing'),
            ],
        ];
    }
}
