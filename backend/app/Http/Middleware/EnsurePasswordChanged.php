<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A staff member with a temporary password must set their own before using the shop screens. */
class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password) {
            return response()->json([
                'message' => 'Please set your own password first.',
                'code' => 'password_change_required',
            ], 403);
        }

        return $next($request);
    }
}
