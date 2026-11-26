<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Approval;
use App\Models\CatalogueTerm;
use App\Models\Payment;
use App\Models\Roll;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\SaleReturn;
use App\Models\StockItem;
use App\Models\User;
use App\Support\MpesaCodes;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Posts a counter sale in one transaction: the lines, the stock they take off the shelf
 * (or off a roll, for fabric by the metre) and the payments that cover the total.
 * Prices are whatever was agreed at the counter; the asking price is kept beside it.
 */
final class SaleRecorder
{
    public function __construct(
        private StockItemLedger $items,
        private StockLedger $rolls,
    ) {}

    /**
     * @param  array{
     *     customer_id?: int|null,
     *     customer_name?: string|null,
     *     note?: string|null,
     *     lines: list<array{stock_item_id?: int|null, quantity?: int|null, roll_id?: int|null, length_cm?: int|null, total_cents: int}>,
     *     payments?: list<array{method: string, amount_cents: int, mpesa_code?: string|null}>
     * }  $data
     * @param  Approval|null  $approval  goods sold from an approval already left the shelf when they went out
     */
    public function record(User $actor, array $data, ?Approval $approval = null): Sale
    {
        $lines = $data['lines'];
        $payments = $data['payments'] ?? [];
        $total = array_sum(array_column($lines, 'total_cents'));
        $customerId = $data['customer_id'] ?? null;

        $this->checkPayments($payments, $total, $customerId);

        return DB::transaction(function () use ($actor, $data, $lines, $payments, $total, $customerId, $approval) {
            // Lock every item and roll in id order so two phones selling together cannot deadlock.
            $items = $this->lockItems(array_filter(array_column($lines, 'stock_item_id')));
            $rolls = $this->lockRolls(array_filter(array_column($lines, 'roll_id')));

            $sale = Sale::create([
                'number' => $this->nextNumber(),
                'customer_id' => $customerId,
                'approval_id' => $approval?->id,
                'customer_name' => $customerId ? '' : CatalogueTerm::clean($data['customer_name'] ?? ''),
                'total_cents' => $total,
                'note' => trim((string) ($data['note'] ?? '')),
                'sold_by' => $actor->id,
            ]);

            foreach ($lines as $i => $line) {
                isset($line['stock_item_id'])
                    ? $this->sellProduct($sale, $items[$line['stock_item_id']], $line, $i, $actor, $approval !== null)
                    : $this->sellFabric($sale, $rolls[$line['roll_id']], $line, $i, $actor);
            }

            foreach ($payments as $payment) {
                Payment::create([
                    'sale_id' => $sale->id,
                    'method' => $payment['method'],
                    'amount_cents' => $payment['amount_cents'],
                    'mpesa_code' => $payment['mpesa_code'] ?? null,
                    'received_by' => $actor->id,
                ]);
            }

            Audit::record($actor, 'sale.recorded', $sale, [
                'number' => $sale->number,
                'total_cents' => $total,
                'lines' => count($lines),
                'methods' => array_values(array_unique(array_column($payments, 'method'))),
                'approval' => $approval?->number,
            ]);

            return $sale;
        });
    }

    /** Cancel a mistaken sale: stock goes back, payments stop counting, the record stays. */
    public function void(User $actor, Sale $sale, string $reason): Sale
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Say why the sale is being voided.');
        }

        return DB::transaction(function () use ($actor, $sale, $reason) {
            $locked = Sale::query()->whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($locked->isVoided()) {
                throw StockRuleViolation::on('reason', "Sale {$locked->number} is already voided.");
            }
            if (SaleReturn::where('sale_id', $locked->id)->exists()) {
                throw StockRuleViolation::on('reason', "Sale {$locked->number} has returns recorded against it; record another return instead of voiding.");
            }
            if ($locked->approval_id !== null) {
                throw StockRuleViolation::on('reason', "Sale {$locked->number} came from goods on approval; record a return instead of voiding.");
            }

            $lines = SaleLine::where('sale_id', $locked->id)->orderBy('id')->get();
            $items = $this->lockItems($lines->pluck('stock_item_id')->filter()->all());
            $rolls = $this->lockRolls($lines->pluck('roll_id')->filter()->all());
            $note = "Sale {$locked->number} voided: {$reason}";

            foreach ($lines as $line) {
                if ($line->kind === 'product') {
                    $item = $items[$line->stock_item_id];
                    if ($item->tracks_stock) {
                        $this->items->post($item, $line->quantity, 'reversal', $actor, 'sales', $locked->id, $note);
                    }
                } else {
                    $this->rolls->post($rolls[$line->roll_id], $line->length_cm, 'reversal', $actor, 'sales', $locked->id, $note);
                }
            }

            $now = now();
            Payment::where('sale_id', $locked->id)->whereNull('voided_at')->update(['voided_at' => $now]);
            $locked->update([
                'status' => 'voided',
                'voided_by' => $actor->id,
                'voided_at' => $now,
                'void_reason' => $reason,
            ]);

            Audit::record($actor, 'sale.voided', $locked, [
                'number' => $locked->number,
                'total_cents' => $locked->total_cents,
                'reason' => $reason,
            ]);

            return $locked;
        });
    }

    /** @param list<array{method: string, amount_cents: int, mpesa_code?: string|null}> $payments */
    private function checkPayments(array $payments, int $total, ?int $customerId): void
    {
        $paid = array_sum(array_column($payments, 'amount_cents'));
        if ($paid !== $total) {
            throw StockRuleViolation::on('payments', sprintf(
                'Payments add up to KES %s but the sale is KES %s.',
                number_format($paid / 100), number_format($total / 100),
            ));
        }

        foreach ($payments as $i => $payment) {
            if ($payment['method'] === 'account' && $customerId === null) {
                throw StockRuleViolation::on("payments.{$i}.method", 'Choose the customer before putting a sale on "to pay".');
            }
        }

        $codes = array_values(array_filter(array_column($payments, 'mpesa_code')));
        if (count($codes) !== count(array_unique($codes))) {
            throw StockRuleViolation::on('payments', 'The same M-Pesa code is entered twice.');
        }
        foreach ($payments as $i => $payment) {
            if (($payment['mpesa_code'] ?? null) !== null) {
                MpesaCodes::assertUnused($payment['mpesa_code'], "payments.{$i}.mpesa_code");
            }
        }
    }

    /**
     * @param  array<string, mixed>  $line
     */
    private function sellProduct(Sale $sale, StockItem $item, array $line, int $index, User $actor, bool $alreadyIssued = false): void
    {
        if (! $item->isProduct() || (! $item->active && ! $alreadyIssued)) {
            throw StockRuleViolation::on("lines.{$index}.stock_item_id", "{$item->name} is not for sale.");
        }

        SaleLine::create([
            'sale_id' => $sale->id,
            'kind' => 'product',
            'stock_item_id' => $item->id,
            'description' => $item->name,
            'quantity' => $line['quantity'],
            'unit' => $item->unit,
            'asking_unit_cents' => $item->price_cents,
            'total_cents' => $line['total_cents'],
        ]);

        if ($item->tracks_stock && ! $alreadyIssued) {
            $this->items->post($item, -$line['quantity'], 'sale', $actor, 'sales', $sale->id, "Sale {$sale->number}", "lines.{$index}.quantity");
        }
    }

    /**
     * @param  array<string, mixed>  $line
     */
    private function sellFabric(Sale $sale, Roll $roll, array $line, int $index, User $actor): void
    {
        if ($roll->status === 'written_off') {
            throw StockRuleViolation::on("lines.{$index}.roll_id", "Roll {$roll->tag} is written off.");
        }

        $roll->loadMissing('fabric.colour', 'fabric.texture', 'fabric.materialType');
        $fabric = $roll->fabric;

        SaleLine::create([
            'sale_id' => $sale->id,
            'kind' => 'fabric',
            'roll_id' => $roll->id,
            'description' => mb_substr(sprintf('%s (roll %s)', $fabric->displayName(), $roll->tag), 0, 160),
            'length_cm' => $line['length_cm'],
            'unit' => 'm',
            'asking_unit_cents' => $fabric->retail_price_cents_per_m,
            'total_cents' => $line['total_cents'],
        ]);

        try {
            $this->rolls->post($roll, -$line['length_cm'], 'sale', $actor, 'sales', $sale->id, "Sale {$sale->number}");
        } catch (ValidationException $e) {
            throw StockRuleViolation::on("lines.{$index}.length_cm", $e->getMessage());
        }
    }

    /**
     * @param  array<int|string>  $ids
     * @return array<int, StockItem>
     */
    private function lockItems(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        sort($ids);
        $locked = [];
        foreach ($ids as $id) {
            $locked[$id] = $this->items->lockedItem($id);
        }

        return $locked;
    }

    /**
     * @param  array<int|string>  $ids
     * @return array<int, Roll>
     */
    private function lockRolls(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        sort($ids);
        $locked = [];
        foreach ($ids as $id) {
            $locked[$id] = $this->rolls->lockedRoll($id);
        }

        return $locked;
    }

    private function nextNumber(): string
    {
        $n = (int) DB::selectOne("SELECT nextval('sale_number_seq') AS n")->n;

        return sprintf('S%05d', $n);
    }
}
