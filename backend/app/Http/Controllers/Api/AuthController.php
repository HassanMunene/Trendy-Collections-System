<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Sign in with a username or a phone number, plus password. */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $login = trim($data['login']);
        $phone = Phone::looksLikePhone($login) ? Phone::normalize($login) : null;
        $user = User::query()
            ->where('username', $login)
            ->when($phone, fn ($q) => $q->orWhere('phone', $phone))
            ->first();

        // Same message for "no such user" and "wrong password" so accounts cannot be guessed.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['login' => 'Wrong username/phone or password.']);
        }
        if (! $user->active) {
            throw ValidationException::withMessages(['login' => 'This account has been switched off. Ask the owner.']);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $user->forceFill(['last_login_at' => now()])->save();
        Audit::record($user, 'auth.login', $user);

        return response()->json(['data' => UserResource::me($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        if ($user) {
            Audit::record($user, 'auth.logout', $user);
        }

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => UserResource::me($request->user())]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string', 'current_password:web'],
            'password' => ['required', 'string', 'confirmed', 'different:current_password', Password::min(8)],
        ]);

        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => false,
        ])->save();
        Audit::record($user, 'auth.password_changed', $user);

        return response()->json(['data' => UserResource::me($user)]);
    }
}
