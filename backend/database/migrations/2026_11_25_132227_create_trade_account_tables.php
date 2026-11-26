<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Milestone 3: trade accounts (docs/08-SALES-BOOK-FINDINGS.md).
 *
 *  - A payment may now stand on its own against a customer: paying off "to pay" debt.
 *  - Returns bring sold goods back to the shelf with a refund (cash, M-Pesa, account credit or none).
 *  - Expenses paid by the shop, and the day-end cash count that checks the drawer.
 *  - Goods on approval: neighbouring shops take stock for at most a week, then return it or pay.
 *
 * Money records are never edited or deleted; mistakes are voided with a reason.
 */
return new class extends Migration
{
    private const PERMISSION_DEFAULTS = [
        'manager' => ['take_returns', 'record_expenses', 'close_day'],
        'cashier' => ['record_expenses', 'close_day'],
    ];

    public function up(): void
    {
        // Payments against a customer's account, not a sale.
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable()->after('sale_id')->constrained();
            $table->text('note')->default('')->after('mpesa_code');
            $table->foreignId('voided_by')->nullable()->after('voided_at')->constrained('users');
            $table->text('void_reason')->default('')->after('voided_by');
            $table->index(['customer_id', 'id']);
        });
        DB::statement('ALTER TABLE payments ALTER COLUMN sale_id DROP NOT NULL');
        DB::statement("ALTER TABLE payments ADD CONSTRAINT payments_owner_check CHECK (sale_id IS NOT NULL OR (customer_id IS NOT NULL AND method IN ('cash','send_money','paybill')))");

        DB::statement('CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1');
        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('number', 12)->unique();
            $table->foreignId('sale_id')->constrained();
            $table->string('refund_method', 12);
            $table->bigInteger('refund_cents');
            $table->text('reason');
            $table->foreignId('created_by')->constrained('users');
            $table->timestampTz('created_at')->useCurrent();
            $table->index('sale_id');
            $table->index('created_at');
        });
        DB::statement("ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_method_check CHECK (refund_method IN ('cash','send_money','paybill','account','none'))");
        DB::statement("ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_refund_check CHECK (refund_cents >= 0 AND (refund_method <> 'none' OR refund_cents = 0))");
        DB::statement('ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_reason_check CHECK (length(btrim(reason)) > 0)');
        Schema::create('sale_return_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained();
            $table->foreignId('sale_line_id')->constrained();
            $table->integer('quantity');
            $table->index('sale_line_id');
        });
        DB::statement('ALTER TABLE sale_return_lines ADD CONSTRAINT sale_return_lines_quantity_check CHECK (quantity > 0)');

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('category', 20);
            $table->bigInteger('amount_cents');
            $table->string('method', 12);
            $table->string('paid_to', 80)->default('');
            $table->text('description')->default('');
            $table->foreignId('recorded_by')->constrained('users');
            $table->timestampTz('voided_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users');
            $table->text('void_reason')->default('');
            $table->timestampTz('created_at')->useCurrent();
            $table->index('created_at');
        });
        DB::statement("ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('transport','tailor_pay','food','materials','rent','airtime','other'))");
        DB::statement("ALTER TABLE expenses ADD CONSTRAINT expenses_method_check CHECK (method IN ('cash','send_money','paybill'))");
        DB::statement('ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount_cents > 0)');

        Schema::create('cash_counts', function (Blueprint $table) {
            $table->id();
            $table->date('business_date');
            $table->bigInteger('expected_cents');
            $table->bigInteger('counted_cents');
            $table->bigInteger('kept_cents');
            $table->text('note')->default('');
            $table->foreignId('counted_by')->constrained('users');
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['business_date', 'id']);
        });
        DB::statement('ALTER TABLE cash_counts ADD CONSTRAINT cash_counts_values_check CHECK (counted_cents >= 0 AND kept_cents >= 0 AND kept_cents <= counted_cents)');

        DB::statement('CREATE SEQUENCE IF NOT EXISTS approval_number_seq START 1');
        Schema::create('approvals', function (Blueprint $table) {
            $table->id();
            $table->string('number', 12)->unique();
            $table->foreignId('customer_id')->constrained();
            $table->string('status', 10)->default('open');
            $table->date('due_on');
            $table->text('note')->default('');
            $table->foreignId('created_by')->constrained('users');
            $table->timestampTz('closed_at')->nullable();
            $table->timestampsTz();
            $table->index(['status', 'due_on']);
            $table->index(['customer_id', 'id']);
        });
        DB::statement("ALTER TABLE approvals ADD CONSTRAINT approvals_status_check CHECK (status IN ('open','closed'))");
        Schema::create('approval_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_id')->constrained();
            $table->foreignId('stock_item_id')->constrained();
            $table->integer('quantity_out');
            $table->integer('quantity_returned')->default(0);
            $table->integer('quantity_sold')->default(0);
            $table->bigInteger('unit_price_cents')->nullable();
            $table->index('approval_id');
        });
        DB::statement('ALTER TABLE approval_lines ADD CONSTRAINT approval_lines_quantity_check CHECK (quantity_out > 0 AND quantity_returned >= 0 AND quantity_sold >= 0 AND quantity_returned + quantity_sold <= quantity_out)');
        DB::statement('ALTER TABLE approval_lines ADD CONSTRAINT approval_lines_price_check CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0)');

        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('approval_id')->nullable()->after('customer_id')->constrained();
        });

        DB::unprepared(<<<'SQL'
CREATE TRIGGER sale_returns_append_only BEFORE UPDATE OR DELETE ON sale_returns
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER sale_return_lines_append_only BEFORE UPDATE OR DELETE ON sale_return_lines
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER cash_counts_append_only BEFORE UPDATE OR DELETE ON cash_counts
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

-- Sales, payments and expenses may only change by being voided, never edited or deleted.
CREATE OR REPLACE FUNCTION sales_only_void() RETURNS trigger AS $$
DECLARE
    void_columns text[] := ARRAY['voided_at','voided_by','void_reason'];
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Posted % records cannot be deleted; void them instead', TG_TABLE_NAME;
    END IF;
    IF TG_TABLE_NAME = 'sales' THEN
        IF OLD.status <> 'posted' OR NEW.status <> 'voided'
            OR (to_jsonb(NEW) - (void_columns || ARRAY['status','updated_at']))
               <> (to_jsonb(OLD) - (void_columns || ARRAY['status','updated_at'])) THEN
            RAISE EXCEPTION 'A posted sale can only be voided';
        END IF;
    ELSE
        IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
            OR (to_jsonb(NEW) - void_columns) <> (to_jsonb(OLD) - void_columns) THEN
            RAISE EXCEPTION 'A % record can only be voided', TG_TABLE_NAME;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER expenses_only_void BEFORE UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION sales_only_void();
SQL);

        $now = now();
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
        DB::table('role_permissions')->whereIn('permission', ['take_returns', 'record_expenses', 'close_day'])->delete();

        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approval_id');
        });
        Schema::dropIfExists('approval_lines');
        Schema::dropIfExists('approvals');
        DB::statement('DROP SEQUENCE IF EXISTS approval_number_seq');
        Schema::dropIfExists('cash_counts');
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('sale_return_lines');
        Schema::dropIfExists('sale_returns');
        DB::statement('DROP SEQUENCE IF EXISTS return_number_seq');

        // Rolling back removes payments that only exist for this feature; the void-only rule is paused for that.
        DB::statement('ALTER TABLE payments DISABLE TRIGGER payments_only_void');
        DB::table('payments')->whereNull('sale_id')->delete();
        DB::statement('ALTER TABLE payments ENABLE TRIGGER payments_only_void');
        DB::statement('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_owner_check');
        DB::statement('ALTER TABLE payments ALTER COLUMN sale_id SET NOT NULL');
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['customer_id', 'id']);
            $table->dropConstrainedForeignId('customer_id');
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['note', 'void_reason']);
        });

        // Back to the M2 rule set (sales and payments only).
        DB::unprepared(<<<'SQL'
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
SQL);
    }
};
