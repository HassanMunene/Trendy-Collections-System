<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\User;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

/**
 * php artisan trendy:create-owner            (asks questions)
 * php artisan trendy:create-owner --superadmin
 */
class CreateOwner extends Command
{
    protected $signature = 'trendy:create-owner
        {--superadmin : Mark this account as the superadmin (oversight account)}
        {--name=} {--username=} {--phone=} {--password= : Avoid in shared terminals; it stays in shell history}';

    protected $description = 'Create an owner account (optionally the superadmin)';

    public function handle(): int
    {
        $superadmin = (bool) $this->option('superadmin');
        if ($superadmin && User::where('is_superadmin', true)->exists()) {
            $this->error('A superadmin account already exists.');

            return self::FAILURE;
        }

        $input = [
            'name' => $this->option('name') ?? text('Full name', required: true),
            'username' => $this->option('username') ?? text('Username (used to sign in)', required: true),
            'phone' => Phone::normalize($this->option('phone') ?? text('Mobile number (optional)')),
            'password' => $this->option('password') ?? password('Password (at least 8 characters)', required: true),
        ];

        $validator = Validator::make($input, [
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/', 'unique:users,username'],
            'phone' => ['nullable', 'unique:users,phone'],
            'password' => ['required', Password::min(8)],
        ]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $user = new User($input + ['role' => Role::Owner->value, 'active' => true]);
        $user->is_superadmin = $superadmin;
        $user->save();
        Audit::record(null, $superadmin ? 'staff.superadmin_created' : 'staff.owner_created', $user, ['username' => $user->username, 'via' => 'console']);

        $this->info(($superadmin ? 'Superadmin' : 'Owner')." account '{$user->username}' created.");

        return self::SUCCESS;
    }
}
