<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\StockAdjustment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * A stock count correction: staff measure the roll and enter what is really there.
 * The previous balance, new balance, reason and person are kept forever.
 */
final class StockAdjuster
{
    public function __construct(private StockLedger $ledger) {}

    public function adjust(int $rollId, int $countedCm, string $reason, User $actor): StockAdjustment
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Give a reason for the correction.');
        }
        if ($countedCm < 0) {
            throw StockRuleViolation::on('counted_cm', 'The counted length cannot be negative.');
        }

        return DB::transaction(function () use ($rollId, $countedCm, $reason, $actor) {
            $roll = $this->ledger->lockedRoll($rollId);
            $before = $roll->balance_cm;

            if ($countedCm === $before) {
                throw StockRuleViolation::on('counted_cm', 'The counted length is the same as the current balance; nothing to correct.');
            }

            $adjustment = StockAdjustment::create([
                'roll_id' => $roll->id,
                'before_cm' => $before,
                'after_cm' => $countedCm,
                'reason' => $reason,
                'actor_id' => $actor->id,
            ]);

            $this->ledger->post($roll, $countedCm - $before, 'adjustment', $actor, 'stock_adjustments', $adjustment->id, $reason);

            Audit::record($actor, 'roll.adjusted', $roll, [
                'before_cm' => $before,
                'after_cm' => $countedCm,
                'reason' => $reason,
            ]);

            return $adjustment;
        });
    }
}
