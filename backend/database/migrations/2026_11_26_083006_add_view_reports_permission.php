<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * Reports: sales, best sellers, money in and out and who owes the shop, over any dates.
 * Owners always see them; managers do by default. Owners can change this per role.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        DB::table('role_permissions')->insertOrIgnore([
            ['role' => 'manager', 'permission' => 'view_reports', 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'view_reports')->delete();
    }
};
