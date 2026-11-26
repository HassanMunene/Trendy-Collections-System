<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Adding stock to an item that already exists, and correcting a shelf count. */
final class StockItemCounter
{
    public function __construct(private StockItemLedger $ledger) {}

    public function receive(User $actor, StockItem $item, int $quantity, string $note = ''): StockItem
    {
        return DB::transaction(function () use ($actor, $item, $quantity, $note) {
            $locked = $this->ledger->lockedItem($item->id);
            $this->guardCounted($locked);
            $this->ledger->post($locked, $quantity, 'receipt', $actor, note: trim($note));
            Audit::record($actor, 'stock_item.restocked', $locked, ['quantity' => $quantity, 'note' => trim($note)]);

            return $locked;
        });
    }

    public function correct(User $actor, StockItem $item, int $counted, string $reason): StockItem
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Give a reason for the correction.');
        }

        return DB::transaction(function () use ($actor, $item, $counted, $reason) {
            $locked = $this->ledger->lockedItem($item->id);
            $this->guardCounted($locked);
            $before = $locked->quantity;
            if ($counted === $before) {
                throw StockRuleViolation::on('counted', 'The count is the same as the system; nothing to correct.');
            }
            $this->ledger->post($locked, $counted - $before, 'adjustment', $actor, note: $reason);
            Audit::record($actor, 'stock_item.adjusted', $locked, ['before' => $before, 'after' => $counted, 'reason' => $reason]);

            return $locked;
        });
    }

    private function guardCounted(StockItem $item): void
    {
        if (! $item->tracks_stock) {
            throw StockRuleViolation::on('quantity', "{$item->name} is a service and is not counted.");
        }
    }
}
