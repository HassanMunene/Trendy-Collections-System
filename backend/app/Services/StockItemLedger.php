<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\StockItem;
use App\Models\StockItemMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * The only code allowed to change a stock item's quantity (finished goods and supplies).
 * Callers must already be inside a transaction and hold the row lock (lockedItem()).
 */
final class StockItemLedger
{
    public function lockedItem(int $itemId): StockItem
    {
        $this->assertInTransaction();

        return StockItem::query()->whereKey($itemId)->lockForUpdate()->firstOrFail();
    }

    public function post(
        StockItem $item,
        int $change,
        string $kind,
        User $actor,
        ?string $referenceType = null,
        ?int $referenceId = null,
        string $note = '',
        string $field = 'quantity',
    ): StockItemMovement {
        $this->assertInTransaction();
        if ($change === 0) {
            throw new LogicException('A stock movement must change the quantity.');
        }
        if (! $item->tracks_stock) {
            throw new LogicException("{$item->name} is not counted as stock.");
        }

        $newBalance = $item->quantity + $change;
        if ($newBalance < 0) {
            throw StockRuleViolation::on($field, sprintf('Only %d %s of %s left.', $item->quantity, $item->unit, $item->name));
        }

        $movement = StockItemMovement::create([
            'stock_item_id' => $item->id,
            'change_qty' => $change,
            'balance_after' => $newBalance,
            'kind' => $kind,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'note' => $note,
            'actor_id' => $actor->id,
        ]);

        $item->quantity = $newBalance;
        $item->save();

        return $movement;
    }

    private function assertInTransaction(): void
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('Stock changes must run inside a database transaction.');
        }
    }
}
