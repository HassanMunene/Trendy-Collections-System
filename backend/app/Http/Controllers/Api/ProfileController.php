<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/** The signed-in person editing their own account (name, contact, photo). */
class ProfileController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->merge([
            'username' => is_string($request->input('username')) ? trim($request->input('username')) : $request->input('username'),
            'phone' => Phone::normalize($request->input('phone')) ?? $request->input('phone'),
        ]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')->ignore($user)],
            'phone' => ['nullable', 'string', 'regex:/^254[17]\d{8}$/', Rule::unique('users', 'phone')->ignore($user)],
        ], [
            'username.regex' => 'Use letters, numbers, dots, dashes or underscores only.',
            'phone.regex' => 'Enter a Kenyan mobile number like 0712 345 678.',
        ]);

        $before = $user->only(['name', 'username', 'phone']);
        $user->update($data);
        Audit::record($user, 'profile.updated', $user, ['before' => $before, 'after' => $user->only(['name', 'username', 'phone'])]);

        return response()->json(['data' => UserResource::me($user)]);
    }

    public function updateAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
        ]);

        $user = $request->user();
        $this->forgetAvatar($user);

        $user->forceFill(['avatar_path' => $request->file('avatar')->store('avatars', 'public')])->save();
        Audit::record($user, 'profile.avatar_updated', $user);

        return response()->json(['data' => UserResource::me($user)]);
    }

    public function destroyAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->forgetAvatar($user);

        $user->forceFill(['avatar_path' => null])->save();
        Audit::record($user, 'profile.avatar_removed', $user);

        return response()->json(['data' => UserResource::me($user)]);
    }

    private function forgetAvatar(User $user): void
    {
        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }
    }
}
