<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Seeds match the permissions the shop had before this table existed. */
    private const DEFAULTS = [
        'manager' => ['manage_catalogue', 'receive_stock', 'adjust_stock', 'view_costs'],
        'cashier' => [],
        'cutter' => [],
        'tailor' => [],
    ];

    public function up(): void
    {
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->string('role', 20);
            $table->string('permission', 40);
            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();
            $table->primary(['role', 'permission']);
        });

        $now = now();
        $rows = [];
        foreach (self::DEFAULTS as $role => $permissions) {
            foreach ($permissions as $permission) {
                $rows[] = ['role' => $role, 'permission' => $permission, 'created_at' => $now, 'updated_at' => $now];
            }
        }

        if ($rows !== []) {
            DB::table('role_permissions')->insert($rows);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
    }
};
