<?php

namespace App\Providers;

use App\Models\User;
use App\Support\Permission;
use App\Support\RolePermissions;
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
         * Who may do what. Owners have everything; other roles get what the owner
         * ticks on the Users & roles screen (role_permissions table).
         */
        Gate::define('manage-staff', fn (User $u) => RolePermissions::allows($u, Permission::MANAGE_STAFF));
        Gate::define('manage-catalogue', fn (User $u) => RolePermissions::allows($u, Permission::MANAGE_CATALOGUE));
        Gate::define('receive-stock', fn (User $u) => RolePermissions::allows($u, Permission::RECEIVE_STOCK));
        Gate::define('adjust-stock', fn (User $u) => RolePermissions::allows($u, Permission::ADJUST_STOCK));
        Gate::define('view-costs', fn (User $u) => RolePermissions::allows($u, Permission::VIEW_COSTS));
        Gate::define('sell', fn (User $u) => RolePermissions::allows($u, Permission::SELL));
        Gate::define('void-sales', fn (User $u) => RolePermissions::allows($u, Permission::VOID_SALES));
        Gate::define('record-sewing', fn (User $u) => RolePermissions::allows($u, Permission::RECORD_SEWING));
        Gate::define('view-audit', fn (User $u) => RolePermissions::allows($u, Permission::VIEW_AUDIT));

        RateLimiter::for('login', function (Request $request) {
            $login = mb_strtolower((string) $request->input('login'));

            return [
                Limit::perMinute(5)->by('login:'.$login.'|'.$request->ip()),
                Limit::perMinute(30)->by('login-ip:'.$request->ip()),
            ];
        });
    }
}
