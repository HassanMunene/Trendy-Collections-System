<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\RoleCatalog;
use App\Support\RolePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A tiny, cache-free summary of what the signed-in account may currently do.
 * The React app polls it so a role change reaches open screens without a reload.
 */
class SessionController extends Controller
{
    public function permissions(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'fingerprint' => sha1(implode('|', [
                $user->role,
                RoleCatalog::label($user->role),
                $user->is_superadmin ? '1' : '0',
                $user->active ? '1' : '0',
                $user->must_change_password ? '1' : '0',
                implode(',', RolePermissions::forRole($user->role)),
            ])),
        ]]);
    }
}
