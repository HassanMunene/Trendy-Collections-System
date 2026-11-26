<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Milestone 4: custom orders, the made-to-measure jobs in the sales book
 * ("14 metres curtain + 9 m sheer + kitchen curtain, deposit 15,000, balance 5,300").
 *
 *  - An order belongs to a named customer, has a due date and moves
 *    taken -> in_work -> ready -> collected (or cancelled).
 *  - Lines are fabric metres from a roll (cut when work starts), finished products
 *    (handed over at collection) or work with a price (sewing, delivery, fitting).
 *  - Deposits, part-payments and the balance are payments linked to the order.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1');
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('number', 12)->unique();
            $table->foreignId('customer_id')->constrained();
            $table->string('status', 12)->default('taken');
            $table->date('due_on');
            $table->bigInteger('total_cents');
            $table->text('note')->default('');
            $table->foreignId('created_by')->constrained('users');
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('ready_at')->nullable();
            $table->timestampTz('collected_at')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users');
            $table->text('cancel_reason')->default('');
            // Deposit given back when an order is cancelled (money out on the day of cancelling).
            $table->string('refund_method', 12)->nullable();
            $table->bigInteger('refund_cents')->default(0);
            $table->timestampsTz();
            $table->index(['status', 'due_on']);
            $table->index(['customer_id', 'id']);
        });
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('taken','in_work','ready','collected','cancelled'))");
        DB::statement('ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total_cents > 0)');
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_refund_check CHECK (refund_cents >= 0 AND (refund_cents = 0 OR refund_method IN ('cash','send_money','paybill')))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_cancel_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))");

        Schema::create('order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained();
            $table->string('kind', 10);
            $table->foreignId('roll_id')->nullable()->constrained();
            $table->integer('length_cm')->nullable();
            $table->foreignId('stock_item_id')->nullable()->constrained();
            $table->integer('quantity')->nullable();
            $table->string('description', 160);
            $table->bigInteger('total_cents');
            $table->index('order_id');
        });
        DB::statement("ALTER TABLE order_lines ADD CONSTRAINT order_lines_kind_check CHECK (
            (kind = 'fabric' AND roll_id IS NOT NULL AND length_cm > 0 AND stock_item_id IS NULL AND quantity IS NULL)
            OR (kind = 'product' AND stock_item_id IS NOT NULL AND quantity > 0 AND roll_id IS NULL AND length_cm IS NULL)
            OR (kind = 'work' AND roll_id IS NULL AND length_cm IS NULL AND stock_item_id IS NULL AND quantity IS NULL))");
        DB::statement('ALTER TABLE order_lines ADD CONSTRAINT order_lines_total_check CHECK (total_cents >= 0)');
        DB::statement('ALTER TABLE order_lines ADD CONSTRAINT order_lines_description_check CHECK (length(btrim(description)) > 0)');
        DB::unprepared('CREATE TRIGGER order_lines_append_only BEFORE UPDATE OR DELETE ON order_lines FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();');

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('order_id')->nullable()->after('sale_id')->constrained();
            $table->index(['order_id', 'id']);
        });
        DB::statement('ALTER TABLE payments DROP CONSTRAINT payments_owner_check');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_owner_check CHECK (
            (sale_id IS NOT NULL AND order_id IS NULL)
            OR (order_id IS NOT NULL AND sale_id IS NULL)
            OR (sale_id IS NULL AND order_id IS NULL AND customer_id IS NOT NULL AND method IN ('cash','send_money','paybill')))");
    }

    public function down(): void
    {
        // Rolling back removes payments that only exist for this feature; the void-only rule is paused for that.
        DB::statement('ALTER TABLE payments DISABLE TRIGGER payments_only_void');
        DB::table('payments')->whereNotNull('order_id')->delete();
        DB::statement('ALTER TABLE payments ENABLE TRIGGER payments_only_void');
        DB::statement('ALTER TABLE payments DROP CONSTRAINT payments_owner_check');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_owner_check CHECK (sale_id IS NOT NULL OR (customer_id IS NOT NULL AND method IN ('cash','send_money','paybill')))");
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['order_id', 'id']);
            $table->dropConstrainedForeignId('order_id');
        });
        Schema::dropIfExists('order_lines');
        Schema::dropIfExists('orders');
        DB::statement('DROP SEQUENCE IF EXISTS order_number_seq');
    }
};
