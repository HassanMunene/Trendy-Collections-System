<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Case-insensitive text: "Amina" and "amina" are the same username.
        DB::statement('CREATE EXTENSION IF NOT EXISTS citext');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            // Stored normalised as 2547XXXXXXXX / 2541XXXXXXXX (see App\Support\Phone).
            $table->string('phone', 15)->nullable()->unique();
            $table->string('role', 20);
            $table->boolean('is_superadmin')->default(false);
            $table->boolean('active')->default(true);
            $table->boolean('must_change_password')->default(false);
            $table->string('password');
            $table->rememberToken();
            $table->timestampTz('last_login_at')->nullable();
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE users ALTER COLUMN username TYPE citext');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','manager','cashier','cutter','tailor'))");
        // A superadmin always holds owner permissions as well.
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_superadmin_is_owner CHECK (NOT is_superadmin OR role = 'owner')");

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
    }
};
