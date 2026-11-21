<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\User;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Creates the superadmin from the SUPERADMIN_* environment variables.
 *
 * Runs on every deploy (docker/entrypoint.sh), so it must be idempotent:
 * the existing account is never modified or duplicated.
 *
 * php artisan trendy:ensure-superadmin
 * php artisan trendy:ensure-superadmin --username=boss --password=secret123 --name=Boss
 */
class EnsureSuperadmin extends Command
{
    protected $signature = 'trendy:ensure-superadmin
        {--name=} {--username=} {--phone=} {--password=}';

    protected $description = 'Create the superadmin from SUPERADMIN_* env vars if it does not exist yet';

    public function handle(): int
    {
        $input = [
            'name' => $this->option('name') ?: config('trendy.superadmin.name'),
            'username' => $this->option('username') ?: config('trendy.superadmin.username'),
            'phone' => Phone::normalize($this->option('phone') ?: config('trendy.superadmin.phone')),
            'password' => $this->option('password') ?: config('trendy.superadmin.password'),
        ];

        if (blank($input['username']) || blank($input['password'])) {
            $this->info('SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD not set - skipping superadmin creation.');

            return self::SUCCESS;
        }

        $existing = User::where('is_superadmin', true)->first();
        if ($existing) {
            $this->info("Superadmin '{$existing->username}' already exists - leaving it untouched.");

            return self::SUCCESS;
        }

        if (User::where('username', $input['username'])->exists()) {
            $this->error("Username '{$input['username']}' is already used by another account; no superadmin was created.");

            return self::FAILURE;
        }

        $validator = Validator::make($input, [
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/'],
            'phone' => ['nullable'],
            'password' => ['required', Password::min(8)],
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $user = new User($input + [
            'role' => Role::Owner->value,
            'active' => true,
            'must_change_password' => false,
        ]);
        $user->is_superadmin = true;
        $user->save();

        Audit::record(null, 'staff.superadmin_created', $user, ['username' => $user->username, 'via' => 'env']);

        $this->info("Superadmin '{$user->username}' created from environment variables.");

        return self::SUCCESS;
    }
}
