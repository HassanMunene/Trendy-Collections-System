<?php

namespace App\Providers;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Catch lazy-loading and mass-assignment mistakes during development.
        Model::shouldBeStrict(! $this->app->isProduction());

        /*
         * Who may do what. Everyone signed in can view stock.
         * Keep this list in sync with frontend/src/auth/permissions.ts.
         */
        Gate::define('manage-staff', fn (User $u) => $u->hasRole(Role::Owner));
        Gate::define('manage-catalogue', fn (User $u) => $u->isOwnerOrManager());
        Gate::define('receive-stock', fn (User $u) => $u->isOwnerOrManager());
        Gate::define('adjust-stock', fn (User $u) => $u->isOwnerOrManager());
        Gate::define('view-costs', fn (User $u) => $u->isOwnerOrManager());

        RateLimiter::for('login', function (Request $request) {
            $login = mb_strtolower((string) $request->input('login'));

            return [
                Limit::perMinute(5)->by('login:'.$login.'|'.$request->ip()),
                Limit::perMinute(30)->by('login-ip:'.$request->ip()),
            ];
        });
    }
}
