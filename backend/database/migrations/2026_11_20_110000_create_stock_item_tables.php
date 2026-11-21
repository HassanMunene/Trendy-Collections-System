<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * General shop stock that is not a fabric roll: hangers, trims, lining, buttons.
 * Same ledger rules as rolls: integer quantities, movements are append-only, and
 * stock_items.quantity is a cache of the movement sum kept in the same transaction.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('sku', 20)->nullable()->unique();
            $table->string('unit', 12)->default('pcs');
            $table->integer('quantity')->default(0);
            $table->integer('reorder_level')->nullable();
            $table->bigInteger('cost_cents')->default(0);
            $table->foreignId('supplier_id')->nullable()->constrained();
            $table->string('location')->default('Main shop');
            $table->text('notes')->default('');
            $table->boolean('active')->default(true);
            $table->foreignId('received_by')->constrained('users');
            $table->timestampsTz();
            $table->index('active');
        });

        DB::statement('ALTER TABLE stock_items ALTER COLUMN sku TYPE citext');
        DB::statement('ALTER TABLE stock_items ADD CONSTRAINT stock_items_quantity_check CHECK (quantity >= 0)');
        DB::statement('ALTER TABLE stock_items ADD CONSTRAINT stock_items_cost_check CHECK (cost_cents >= 0)');
        DB::statement('ALTER TABLE stock_items ADD CONSTRAINT stock_items_reorder_check CHECK (reorder_level IS NULL OR reorder_level >= 0)');

        Schema::create('stock_item_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained();
            $table->integer('change_qty');
            $table->integer('balance_after');
            $table->string('kind', 20);
            $table->text('note')->default('');
            $table->foreignId('actor_id')->constrained('users');
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['stock_item_id', 'id']);
            $table->index('created_at');
        });

        DB::statement('ALTER TABLE stock_item_movements ADD CONSTRAINT stock_item_movements_change_check CHECK (change_qty <> 0)');
        DB::statement('ALTER TABLE stock_item_movements ADD CONSTRAINT stock_item_movements_balance_check CHECK (balance_after >= 0)');
        DB::statement("ALTER TABLE stock_item_movements ADD CONSTRAINT stock_item_movements_kind_check CHECK (kind IN ('receipt','adjustment','issue','return','transfer'))");

        DB::unprepared('CREATE TRIGGER stock_item_movements_append_only BEFORE UPDATE OR DELETE ON stock_item_movements FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();');
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_item_movements');
        Schema::dropIfExists('stock_items');
    }
};
