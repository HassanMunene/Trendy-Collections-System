<?php

namespace App\Services;

use App\Models\StockItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Receives non-roll stock in one transaction: creates the item if needed and posts
 * the opening movement. Like rolls, only posted movements may change the quantity.
 */
final class StockItemReceiver
{
    public function __construct(private StockItemLedger $ledger) {}

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

            $locked = $this->ledger->lockedItem($created->id);
            $this->ledger->post($locked, $quantity, 'receipt', $actor, note: 'Opening receipt');

            Audit::record($actor, 'stock_item.received', $locked, [
                'name' => $locked->name,
                'unit' => $locked->unit,
                'quantity' => $quantity,
                'cost_cents' => $locked->cost_cents,
            ]);

            return $locked->refresh();
        });
    }
}
