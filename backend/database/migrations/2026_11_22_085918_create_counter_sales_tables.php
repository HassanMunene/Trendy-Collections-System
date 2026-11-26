<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Milestone 2: the sales book replacement (docs/08-SALES-BOOK-FINDINGS.md).
 *
 *  - Finished goods are stock_items with a product category (window curtain, door curtain,
 *    sheer, pillow case...). Items without a category stay internal supplies.
 *  - A sale is one customer basket: lines (products or fabric metres from a roll) and one or
 *    more payments (cash, send money, paybill, on account). Lines are append-only; a mistake
 *    is voided as a whole, which puts the stock back and is kept on record.
 *  - A sewing batch turns roll metres into finished goods on the shelf, credited to the tailor.
 */
return new class extends Migration
{
    /** The words the shop uses (Mum, 22 Nov 2026): a set is one window, the "half" is the door. */
    private const CATEGORIES = [
        ['Window curtain', 'set', true],
        ['Door curtain', 'piece', true],
        ['Sheer', 'piece', true],
        ['Kitchen curtain', 'set', true],
        ['Pillow case', 'pcs', true],
        ['Pillow', 'pcs', true],
        ['Knot pillow', 'pcs', true],
        ['Bowtie pillow', 'pcs', true],
        ['Curtain rod', 'pcs', true],
        ['Curtain holder', 'pair', true],
        ['Alteration', 'job', false],
    ];

    /** New permissions, given to the roles that do this work today. Owners can change them. */
    private const PERMISSION_DEFAULTS = [
        'manager' => ['sell', 'void_sales', 'record_sewing'],
        'cashier' => ['sell'],
        'cutter' => ['record_sewing'],
        'tailor' => ['record_sewing'],
    ];

    public function up(): void
    {
        Schema::create('product_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('unit', 12);
            $table->boolean('tracks_stock')->default(true);
            $table->smallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestampsTz();
        });
        DB::statement('ALTER TABLE product_categories ALTER COLUMN name TYPE citext');
        DB::statement('ALTER TABLE product_categories ADD CONSTRAINT product_categories_name_not_blank CHECK (length(btrim(name)) > 0)');

        $now = now();
        foreach (self::CATEGORIES as $i => [$name, $unit, $tracksStock]) {
            DB::table('product_categories')->insert([
                'name' => $name, 'unit' => $unit, 'tracks_stock' => $tracksStock,
                'sort_order' => ($i + 1) * 10, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        Schema::table('stock_items', function (Blueprint $table) {
            $table->foreignId('product_category_id')->nullable()->after('id')->constrained();
            $table->foreignId('colour_id')->nullable()->after('product_category_id')->constrained();
            $table->string('variant', 60)->default('')->after('colour_id');
            $table->bigInteger('price_cents')->nullable()->after('cost_cents');
            $table->boolean('tracks_stock')->default(true)->after('quantity');
            $table->index('product_category_id');
        });
        DB::statement('ALTER TABLE stock_items ADD CONSTRAINT stock_items_price_check CHECK (price_cents IS NULL OR price_cents >= 0)');
        DB::statement('ALTER TABLE stock_items ADD CONSTRAINT stock_items_untracked_check CHECK (tracks_stock OR quantity = 0)');
        // One product per category + colour + variant, so "Grey window curtain" exists once.
        DB::statement('CREATE UNIQUE INDEX stock_items_product_unique ON stock_items (product_category_id, COALESCE(colour_id, 0), lower(variant)) WHERE product_category_id IS NOT NULL');

        Schema::table('stock_item_movements', function (Blueprint $table) {
            $table->string('reference_type', 40)->nullable()->after('kind');
            $table->unsignedBigInteger('reference_id')->nullable()->after('reference_type');
        });
        DB::statement('ALTER TABLE stock_item_movements DROP CONSTRAINT stock_item_movements_kind_check');
        DB::statement("ALTER TABLE stock_item_movements ADD CONSTRAINT stock_item_movements_kind_check CHECK (kind IN ('receipt','adjustment','issue','return','transfer','sale','production','reversal'))");
        DB::statement('ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check');
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('receipt','adjustment','cut','sale','return','transfer','reversal'))");

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('phone', 15)->nullable();
            // Neighbouring shops are known by stall code, e.g. "BS 60, 3rd floor".
            $table->string('stall', 60)->default('');
            $table->text('notes')->default('');
            $table->boolean('active')->default(true);
            $table->foreignId('created_by')->constrained('users');
            $table->timestampsTz();
            $table->unique(['name', 'stall']);
        });
        DB::statement('ALTER TABLE customers ALTER COLUMN name TYPE citext');
        DB::statement('ALTER TABLE customers ADD CONSTRAINT customers_name_not_blank CHECK (length(btrim(name)) > 0)');

        DB::statement('CREATE SEQUENCE IF NOT EXISTS sale_number_seq START 1');
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('number', 12)->unique();
            $table->foreignId('customer_id')->nullable()->constrained();
            // A walk-in may give a first name without becoming a customer account.
            $table->string('customer_name', 80)->default('');
            $table->bigInteger('total_cents');
            $table->text('note')->default('');
            $table->string('status', 10)->default('posted');
            $table->foreignId('sold_by')->constrained('users');
            $table->foreignId('voided_by')->nullable()->constrained('users');
            $table->timestampTz('voided_at')->nullable();
            $table->text('void_reason')->default('');
            $table->timestampsTz();
            $table->index('created_at');
            $table->index(['customer_id', 'id']);
        });
        DB::statement('ALTER TABLE sales ADD CONSTRAINT sales_total_check CHECK (total_cents >= 0)');
        DB::statement("ALTER TABLE sales ADD CONSTRAINT sales_status_check CHECK (status IN ('posted','voided'))");
        DB::statement("ALTER TABLE sales ADD CONSTRAINT sales_void_check CHECK ((status = 'voided') = (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) > 0))");

        Schema::create('sale_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained();
            $table->string('kind', 10);
            $table->foreignId('stock_item_id')->nullable()->constrained();
            $table->foreignId('roll_id')->nullable()->constrained();
            // Snapshot of what was sold, so renaming a product never rewrites old sales.
            $table->string('description', 160);
            $table->integer('quantity')->nullable();
            $table->integer('length_cm')->nullable();
            $table->string('unit', 12);
            $table->bigInteger('asking_unit_cents')->nullable();
            $table->bigInteger('total_cents');
            $table->index('sale_id');
            $table->index(['stock_item_id', 'id']);
        });
        DB::statement("ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_kind_check CHECK (
            (kind = 'product' AND stock_item_id IS NOT NULL AND roll_id IS NULL AND quantity > 0 AND length_cm IS NULL)
            OR (kind = 'fabric' AND roll_id IS NOT NULL AND stock_item_id IS NULL AND length_cm > 0 AND quantity IS NULL))");
        DB::statement('ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_money_check CHECK (total_cents >= 0 AND (asking_unit_cents IS NULL OR asking_unit_cents >= 0))');

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained();
            $table->string('method', 12);
            $table->bigInteger('amount_cents');
            $table->string('mpesa_code', 12)->nullable();
            $table->foreignId('received_by')->constrained('users');
            $table->timestampTz('voided_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index('sale_id');
            $table->index('created_at');
        });
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash','send_money','paybill','account'))");
        DB::statement('ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount_cents > 0)');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_code_check CHECK (mpesa_code IS NULL OR (method IN ('send_money','paybill') AND mpesa_code ~ '^[A-Z0-9]{8,12}$'))");
        // One M-Pesa transaction can only be counted once (a voided sale frees its code).
        DB::statement('CREATE UNIQUE INDEX payments_mpesa_code_unique ON payments (mpesa_code) WHERE mpesa_code IS NOT NULL AND voided_at IS NULL');

        Schema::create('sewing_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sewn_by')->constrained('users');
            $table->foreignId('recorded_by')->constrained('users');
            $table->text('note')->default('');
            $table->timestampTz('created_at')->useCurrent();
            $table->index('created_at');
            $table->index(['sewn_by', 'id']);
        });
        Schema::create('sewing_batch_inputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sewing_batch_id')->constrained();
            $table->foreignId('roll_id')->constrained();
            $table->integer('used_cm');
            $table->index('sewing_batch_id');
        });
        DB::statement('ALTER TABLE sewing_batch_inputs ADD CONSTRAINT sewing_batch_inputs_used_check CHECK (used_cm > 0)');
        Schema::create('sewing_batch_outputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sewing_batch_id')->constrained();
            $table->foreignId('stock_item_id')->constrained();
            $table->integer('quantity');
            $table->index('sewing_batch_id');
        });
        DB::statement('ALTER TABLE sewing_batch_outputs ADD CONSTRAINT sewing_batch_outputs_quantity_check CHECK (quantity > 0)');

        DB::unprepared(<<<'SQL'
CREATE TRIGGER sale_lines_append_only BEFORE UPDATE OR DELETE ON sale_lines
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER sewing_batches_append_only BEFORE UPDATE OR DELETE ON sewing_batches
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER sewing_batch_inputs_append_only BEFORE UPDATE OR DELETE ON sewing_batch_inputs
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER sewing_batch_outputs_append_only BEFORE UPDATE OR DELETE ON sewing_batch_outputs
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

-- Sales and payments may only change by being voided, never edited or deleted.
CREATE OR REPLACE FUNCTION sales_only_void() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Posted % records cannot be deleted; void them instead', TG_TABLE_NAME;
    END IF;
    IF TG_TABLE_NAME = 'sales' THEN
        IF OLD.status <> 'posted' OR NEW.status <> 'voided'
            OR (to_jsonb(NEW) - ARRAY['status','voided_by','voided_at','void_reason','updated_at'])
               <> (to_jsonb(OLD) - ARRAY['status','voided_by','voided_at','void_reason','updated_at']) THEN
            RAISE EXCEPTION 'A posted sale can only be voided';
        END IF;
    ELSE
        IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
            OR (to_jsonb(NEW) - 'voided_at') <> (to_jsonb(OLD) - 'voided_at') THEN
            RAISE EXCEPTION 'A payment can only be voided';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_only_void BEFORE UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION sales_only_void();
CREATE TRIGGER payments_only_void BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION sales_only_void();
SQL);

        $rows = [];
        foreach (self::PERMISSION_DEFAULTS as $role => $permissions) {
            foreach ($permissions as $permission) {
                $rows[] = ['role' => $role, 'permission' => $permission, 'created_at' => $now, 'updated_at' => $now];
            }
        }
        DB::table('role_permissions')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        DB::table('role_permissions')->whereIn('permission', ['sell', 'void_sales', 'record_sewing'])->delete();
        Schema::dropIfExists('sewing_batch_outputs');
        Schema::dropIfExists('sewing_batch_inputs');
        Schema::dropIfExists('sewing_batches');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sale_lines');
        Schema::dropIfExists('sales');
        DB::unprepared('DROP FUNCTION IF EXISTS sales_only_void()');
        DB::statement('DROP SEQUENCE IF EXISTS sale_number_seq');
        Schema::dropIfExists('customers');

        DB::statement('ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check');
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('receipt','adjustment','cut','sale','return','transfer'))");
        DB::statement('ALTER TABLE stock_item_movements DROP CONSTRAINT stock_item_movements_kind_check');
        DB::statement("ALTER TABLE stock_item_movements ADD CONSTRAINT stock_item_movements_kind_check CHECK (kind IN ('receipt','adjustment','issue','return','transfer'))");
        Schema::table('stock_item_movements', function (Blueprint $table) {
            $table->dropColumn(['reference_type', 'reference_id']);
        });

        DB::statement('DROP INDEX IF EXISTS stock_items_product_unique');
        DB::statement('ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_untracked_check');
        DB::statement('ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_price_check');
        Schema::table('stock_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_category_id');
            $table->dropConstrainedForeignId('colour_id');
            $table->dropColumn(['variant', 'price_cents', 'tracks_stock']);
        });
        Schema::dropIfExists('product_categories');
    }
};
