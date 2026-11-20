<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Only reference data. Accounts are created with `php artisan trendy:create-owner`. */
    public function run(): void
    {
        $this->call(CatalogueSeeder::class);
    }
}
