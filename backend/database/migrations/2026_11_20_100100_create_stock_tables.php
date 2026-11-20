<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Stock ledger rules (docs/01-PRODUCT-BLUEPRINT.md, "Non-negotiable business rules"):
 *  - lengths are integer centimetres, money is integer cents (KES); no floats
 *  - a roll's balance is the sum of its movements; rolls.balance_cm is a cache of that sum,
 *    updated in the same transaction, and can never go below zero
 *  - movements and adjustments are append-only: mistakes are corrected by new entries
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE SEQUENCE IF NOT EXISTS roll_tag_seq START 1');

        Schema::create('rolls', function (Blueprint $table) {
            $table->id();
            $table->string('tag')->unique();
            $table->foreignId('fabric_id')->constrained();
            $table->foreignId('supplier_id')->nullable()->constrained();
            $table->integer('stated_cm')->nullable();
            $table->integer('received_cm');
            $table->integer('balance_cm');
            $table->bigInteger('cost_cents')->default(0);
            $table->string('dye_lot')->default('');
            $table->string('invoice_ref')->default('');
            $table->date('purchase_date')->nullable();
            $table->string('location')->default('Main shop');
            $table->string('included_services')->default('');
            $table->integer('remnant_alert_cm')->nullable();
            $table->text('notes')->default('');
            $table->string('status', 20)->default('active');
            $table->foreignId('received_by')->constrained('users');
            $table->timestampsTz();
            $table->index(['status', 'fabric_id']);
        });

        DB::statement('ALTER TABLE rolls ALTER COLUMN tag TYPE citext');
        DB::statement('ALTER TABLE rolls ADD CONSTRAINT rolls_received_check CHECK (received_cm > 0)');
        DB::statement('ALTER TABLE rolls ADD CONSTRAINT rolls_stated_check CHECK (stated_cm IS NULL OR stated_cm > 0)');
        DB::statement('ALTER TABLE rolls ADD CONSTRAINT rolls_balance_check CHECK (balance_cm >= 0)');
        DB::statement('ALTER TABLE rolls ADD CONSTRAINT rolls_cost_check CHECK (cost_cents >= 0)');
        DB::statement('ALTER TABLE rolls ADD CONSTRAINT rolls_remnant_alert_check CHECK (remnant_alert_cm IS NULL OR remnant_alert_cm > 0)');
        DB::statement("ALTER TABLE rolls ADD CONSTRAINT rolls_status_check CHECK (status IN ('active','finished','written_off'))");

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('roll_id')->constrained();
            $table->integer('change_cm');
            $table->integer('balance_after_cm');
            $table->string('kind', 20);
            // Links to the document that caused the movement (adjustment, cut, sale...).
            $table->string('reference_type', 40)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->foreignId('actor_id')->constrained('users');
            $table->text('note')->default('');
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['roll_id', 'id']);
            $table->index('created_at');
        });

        DB::statement('ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_change_check CHECK (change_cm <> 0)');
        DB::statement('ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_balance_check CHECK (balance_after_cm >= 0)');
        DB::statement("ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('receipt','adjustment','cut','sale','return','transfer'))");

        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('roll_id')->constrained();
            $table->integer('before_cm');
            $table->integer('after_cm');
            $table->text('reason');
            $table->foreignId('actor_id')->constrained('users');
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement('ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_values_check CHECK (before_cm >= 0 AND after_cm >= 0 AND before_cm <> after_cm)');
        DB::statement('ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_reason_check CHECK (length(btrim(reason)) > 0)');

        // The database itself refuses edits to posted history, whatever the application does.
        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION forbid_ledger_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Posted % records cannot be changed or deleted; post a correction instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
CREATE TRIGGER stock_adjustments_append_only BEFORE UPDATE OR DELETE ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
SQL);

        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users');
            $table->string('action', 60);
            $table->string('entity_type', 40);
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->jsonb('details')->default('{}');
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['entity_type', 'entity_id']);
            $table->index('created_at');
        });

        DB::unprepared('CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();');
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
        Schema::dropIfExists('stock_adjustments');
        Schema::dropIfExists('stock_movements');
        DB::unprepared('DROP FUNCTION IF EXISTS forbid_ledger_change()');
        Schema::dropIfExists('rolls');
        DB::statement('DROP SEQUENCE IF EXISTS roll_tag_seq');
    }
};
