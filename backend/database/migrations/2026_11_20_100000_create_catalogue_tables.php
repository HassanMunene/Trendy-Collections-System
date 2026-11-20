<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Controlled vocabularies: one table each so fabrics can hold real foreign keys. */
    private const TERM_TABLES = ['fabric_categories', 'material_types', 'textures', 'colours'];

    public function up(): void
    {
        foreach (self::TERM_TABLES as $name) {
            Schema::create($name, function (Blueprint $table) {
                $table->id();
                // citext + unique: "Cream" and "cream " cannot both exist (names are trimmed on save).
                $table->string('name')->unique();
                $table->boolean('active')->default(true);
                $table->timestampsTz();
            });
            DB::statement("ALTER TABLE {$name} ALTER COLUMN name TYPE citext");
            DB::statement("ALTER TABLE {$name} ADD CONSTRAINT {$name}_name_not_blank CHECK (length(btrim(name)) > 0)");
        }

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 15)->nullable();
            $table->string('building')->default('');
            $table->string('stall')->default('');
            $table->text('notes')->default('');
            $table->boolean('active')->default(true);
            $table->timestampsTz();
            $table->unique(['name', 'building', 'stall']);
        });

        DB::statement('ALTER TABLE suppliers ALTER COLUMN name TYPE citext');

        DB::statement('CREATE SEQUENCE IF NOT EXISTS fabric_code_seq START 1');

        Schema::create('fabrics', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->foreignId('fabric_category_id')->constrained();
            $table->foreignId('material_type_id')->constrained();
            $table->foreignId('texture_id')->constrained();
            $table->foreignId('colour_id')->constrained();
            $table->string('design')->default('');
            $table->string('shade_code')->default('');
            $table->string('opacity', 20)->default('');
            $table->integer('width_cm')->nullable();
            $table->integer('weight_gsm')->nullable();
            $table->text('care_instructions')->default('');
            $table->bigInteger('retail_price_cents_per_m')->nullable();
            $table->integer('reorder_threshold_cm')->nullable();
            $table->boolean('active')->default(true);
            $table->foreignId('created_by')->constrained('users');
            $table->timestampsTz();
        });

        DB::statement('ALTER TABLE fabrics ALTER COLUMN code TYPE citext');
        DB::statement("ALTER TABLE fabrics ADD CONSTRAINT fabrics_opacity_check CHECK (opacity IN ('', 'sheer', 'light_filtering', 'dim_out', 'blackout'))");
        DB::statement('ALTER TABLE fabrics ADD CONSTRAINT fabrics_width_check CHECK (width_cm IS NULL OR width_cm > 0)');
        DB::statement('ALTER TABLE fabrics ADD CONSTRAINT fabrics_weight_check CHECK (weight_gsm IS NULL OR weight_gsm > 0)');
        DB::statement('ALTER TABLE fabrics ADD CONSTRAINT fabrics_price_check CHECK (retail_price_cents_per_m IS NULL OR retail_price_cents_per_m >= 0)');
        DB::statement('ALTER TABLE fabrics ADD CONSTRAINT fabrics_reorder_check CHECK (reorder_threshold_cm IS NULL OR reorder_threshold_cm >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('fabrics');
        DB::statement('DROP SEQUENCE IF EXISTS fabric_code_seq');
        Schema::dropIfExists('suppliers');
        foreach (array_reverse(self::TERM_TABLES) as $name) {
            Schema::dropIfExists($name);
        }
    }
};
