<?php

namespace App\Services;

use App\Models\StockItem;
use App\Models\StockItemMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Receives non-roll stock in one transaction: creates the item if needed and posts
 * the opening movement. Like rolls, only posted movements may change the quantity.
 */
final class StockItemReceiver
{
    /**
     * @param  array<string, mixed>  $item  validated item fields, including supplier_id
     */
    public function receive(User $actor, array $item, int $quantity): StockItem
    {
        if ($quantity <= 0) {
            throw new LogicException('A receipt must add stock.');
        }

        return DB::transaction(function () use ($actor, $item, $quantity) {
            $created = StockItem::create(array_merge($item, [
                'quantity' => 0,
                'received_by' => $actor->id,
            ]));

            $locked = StockItem::query()->whereKey($created->id)->lockForUpdate()->firstOrFail();
            $movement = $this->post($locked, $quantity, 'receipt', $actor, 'Opening receipt');

            Audit::record($actor, 'stock_item.received', $locked, [
                'name' => $locked->name,
                'unit' => $locked->unit,
                'quantity' => $quantity,
                'cost_cents' => $locked->cost_cents,
            ]);

            return $locked->refresh();
        });
    }

    private function post(StockItem $item, int $change, string $kind, User $actor, string $note = ''): StockItemMovement
    {
        $newBalance = $item->quantity + $change;
        if ($newBalance < 0) {
            throw new LogicException('Stock cannot go below zero.');
        }

        $movement = StockItemMovement::create([
            'stock_item_id' => $item->id,
            'change_qty' => $change,
            'balance_after' => $newBalance,
            'kind' => $kind,
            'note' => $note,
            'actor_id' => $actor->id,
        ]);

        $item->quantity = $newBalance;
        $item->save();

        return $movement;
    }
}
