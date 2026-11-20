<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Roll;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * The only code allowed to change a roll's balance.
 * Callers must already be inside a transaction and hold the roll row lock (lockedRoll()).
 */
final class StockLedger
{
    /** Re-read a roll with a row lock so two phones cannot change the same roll at once. */
    public function lockedRoll(int $rollId): Roll
    {
        $this->assertInTransaction();

        return Roll::query()->whereKey($rollId)->lockForUpdate()->firstOrFail();
    }

    public function post(
        Roll $roll,
        int $changeCm,
        string $kind,
        User $actor,
        ?string $referenceType = null,
        ?int $referenceId = null,
        string $note = '',
    ): StockMovement {
        $this->assertInTransaction();
        if ($changeCm === 0) {
            throw new LogicException('A stock movement must change the balance.');
        }

        $newBalance = $roll->balance_cm + $changeCm;
        if ($newBalance < 0) {
            throw StockRuleViolation::on('quantity', sprintf(
                'Roll %s only has %s m left.', $roll->tag, number_format($roll->balance_cm / 100, 2)
            ));
        }

        $movement = StockMovement::create([
            'roll_id' => $roll->id,
            'change_cm' => $changeCm,
            'balance_after_cm' => $newBalance,
            'kind' => $kind,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'actor_id' => $actor->id,
            'note' => $note,
        ]);

        $roll->balance_cm = $newBalance;
        if ($roll->status !== 'written_off') {
            $roll->status = $newBalance === 0 ? 'finished' : 'active';
        }
        $roll->save();

        return $movement;
    }

    /** Recomputes from the ledger; used by tests and a future integrity check command. */
    public function ledgerBalance(Roll $roll): int
    {
        return (int) StockMovement::where('roll_id', $roll->id)->sum('change_cm');
    }

    private function assertInTransaction(): void
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('Stock changes must run inside a database transaction.');
        }
    }
}
