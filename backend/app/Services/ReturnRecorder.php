<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\SaleReturn;
use App\Models\SaleReturnLine;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Goods brought back from a sale: they go back on the shelf and the customer gets cash,
 * M-Pesa, credit on their account, or nothing (an exchange). A sale can have several returns
 * but never more back than was sold.
 */
final class ReturnRecorder
{
    public function __construct(private StockItemLedger $items) {}

    /**
     * @param  list<array{sale_line_id: int, quantity: int}>  $lines
     */
    public function record(User $actor, Sale $sale, array $lines, string $refundMethod, int $refundCents, string $reason): SaleReturn
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Say why the goods came back.');
        }

        return DB::transaction(function () use ($actor, $sale, $lines, $refundMethod, $refundCents, $reason) {
            $locked = Sale::query()->whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($locked->isVoided()) {
                throw StockRuleViolation::on('lines', "Sale {$locked->number} is voided; nothing to return.");
            }
            if ($refundMethod === 'account' && $locked->customer_id === null) {
                throw StockRuleViolation::on('refund_method', 'Only a sale to a named customer can be credited to their account.');
            }
            if ($refundMethod === 'none' && $refundCents !== 0) {
                throw StockRuleViolation::on('refund_cents', 'An exchange has no refund.');
            }

            $saleLines = SaleLine::where('sale_id', $locked->id)->get()->keyBy('id');
            $alreadyBack = SaleReturnLine::query()
                ->join('sale_returns', 'sale_returns.id', '=', 'sale_return_lines.sale_return_id')
                ->where('sale_returns.sale_id', $locked->id)
                ->groupBy('sale_line_id')
                ->selectRaw('sale_line_id, SUM(quantity) AS qty')
                ->pluck('qty', 'sale_line_id');

            $refundable = 0;
            foreach ($lines as $i => $line) {
                $saleLine = $saleLines->get($line['sale_line_id']);
                if ($saleLine === null) {
                    throw StockRuleViolation::on("lines.{$i}.sale_line_id", "That item is not on sale {$locked->number}.");
                }
                if ($saleLine->kind !== 'product') {
                    throw StockRuleViolation::on("lines.{$i}.sale_line_id", 'Fabric cut from a roll cannot be returned.');
                }
                $left = $saleLine->quantity - (int) ($alreadyBack[$saleLine->id] ?? 0);
                if ($line['quantity'] > $left) {
                    throw StockRuleViolation::on("lines.{$i}.quantity", sprintf('Only %d of %s can still come back.', $left, $saleLine->description));
                }
                // The share of what was actually paid for this line, not the asking price.
                $refundable += intdiv($saleLine->total_cents * $line['quantity'], $saleLine->quantity);
            }
            if ($refundCents > $refundable) {
                throw StockRuleViolation::on('refund_cents', sprintf('The most that can be refunded for these items is KES %s.', number_format($refundable / 100)));
            }

            $return = SaleReturn::create([
                'number' => $this->nextNumber(),
                'sale_id' => $locked->id,
                'refund_method' => $refundMethod,
                'refund_cents' => $refundCents,
                'reason' => $reason,
                'created_by' => $actor->id,
            ]);

            $itemIds = $saleLines->only(array_column($lines, 'sale_line_id'))->pluck('stock_item_id')->unique()->sort()->values();
            $items = $itemIds->mapWithKeys(fn (int $id) => [$id => $this->items->lockedItem($id)]);

            foreach ($lines as $line) {
                $saleLine = $saleLines->get($line['sale_line_id']);
                SaleReturnLine::create([
                    'sale_return_id' => $return->id,
                    'sale_line_id' => $saleLine->id,
                    'quantity' => $line['quantity'],
                ]);
                $item = $items[$saleLine->stock_item_id];
                if ($item->tracks_stock) {
                    $this->items->post($item, $line['quantity'], 'return', $actor, 'sale_returns', $return->id, "Return {$return->number} from sale {$locked->number}");
                }
            }

            Audit::record($actor, 'sale.returned', $return, [
                'number' => $return->number,
                'sale' => $locked->number,
                'refund_method' => $refundMethod,
                'refund_cents' => $refundCents,
                'reason' => $reason,
            ]);

            return $return;
        });
    }

    private function nextNumber(): string
    {
        return sprintf('RT%05d', (int) DB::selectOne("SELECT nextval('return_number_seq') AS n")->n);
    }
}
