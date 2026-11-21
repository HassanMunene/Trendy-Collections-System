<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Built-in roles keep their existing keys so current accounts and permissions stay valid. */
    private const BUILTIN = [
        ['key' => 'owner', 'label' => 'Owner', 'description' => 'Full access to everything, always. This role cannot be limited.', 'full_access' => true, 'position' => 10],
        ['key' => 'manager', 'label' => 'Manager', 'description' => 'Runs the shop day to day: stock, fabrics, suppliers and costs.', 'full_access' => false, 'position' => 20],
        ['key' => 'cashier', 'label' => 'Cashier', 'description' => 'Counter work. Sales and payments come next.', 'full_access' => false, 'position' => 30],
        ['key' => 'cutter', 'label' => 'Cutter', 'description' => 'Cutting work. Job tracking comes next.', 'full_access' => false, 'position' => 40],
        ['key' => 'tailor', 'label' => 'Tailor', 'description' => 'Sewing work. Job tracking comes next.', 'full_access' => false, 'position' => 50],
    ];

    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->string('key', 20)->primary();
            $table->string('label', 40);
            $table->string('description', 200)->default('');
            $table->boolean('builtin')->default(false);
            $table->boolean('full_access')->default(false);
            $table->unsignedSmallInteger('position')->default(100);
            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();
        });

        $now = now();
        DB::table('roles')->insert(array_map(fn (array $role) => $role + [
            'builtin' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], self::BUILTIN));

        // Roles are no longer limited to the five built-ins.
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');

        Schema::table('role_permissions', function (Blueprint $table) {
            $table->foreign('role')->references('key')->on('roles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropForeign(['role']);
        });
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','manager','cashier','cutter','tailor'))");
        Schema::dropIfExists('roles');
    }
};
