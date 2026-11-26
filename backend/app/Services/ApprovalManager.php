<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Approval;
use App\Models\ApprovalLine;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Goods on approval (sale-or-return). Issuing takes them off the shelf; settling brings back
 * what was not sold and turns the rest into an ordinary sale, paid now or put on "to pay".
 */
final class ApprovalManager
{
    public function __construct(
        private StockItemLedger $items,
        private SaleRecorder $sales,
    ) {}

    /**
     * @param  list<array{stock_item_id: int, quantity: int, unit_price_cents?: int|null}>  $lines
     */
    public function issue(User $actor, Customer $customer, array $lines, string $note = ''): Approval
    {
        return DB::transaction(function () use ($actor, $customer, $lines, $note) {
            $approval = Approval::create([
                'number' => sprintf('A%05d', (int) DB::selectOne("SELECT nextval('approval_number_seq') AS n")->n),
                'customer_id' => $customer->id,
                'due_on' => now(DayLedger::TIMEZONE)->addDays(Approval::MAX_DAYS)->toDateString(),
                'note' => trim($note),
                'created_by' => $actor->id,
            ]);

            $ids = array_unique(array_column($lines, 'stock_item_id'));
            sort($ids);
            $locked = [];
            foreach ($ids as $id) {
                $locked[$id] = $this->items->lockedItem($id);
            }

            foreach ($lines as $i => $line) {
                $item = $locked[$line['stock_item_id']];
                if (! $item->isProduct() || ! $item->tracks_stock || ! $item->active) {
                    throw StockRuleViolation::on("lines.{$i}.stock_item_id", "{$item->name} cannot go out on approval.");
                }
                ApprovalLine::create([
                    'approval_id' => $approval->id,
                    'stock_item_id' => $item->id,
                    'quantity_out' => $line['quantity'],
                    'unit_price_cents' => $line['unit_price_cents'] ?? $item->price_cents,
                ]);
                $this->items->post($item, -$line['quantity'], 'issue', $actor, 'approvals', $approval->id,
                    "On approval to {$customer->name} ({$approval->number})", "lines.{$i}.quantity");
            }

            Audit::record($actor, 'approval.issued', $approval, [
                'number' => $approval->number,
                'customer' => $customer->name,
                'pieces' => array_sum(array_column($lines, 'quantity')),
                'due_on' => $approval->due_on->toDateString(),
            ]);

            return $approval;
        });
    }

    /**
     * @param  list<array{approval_line_id: int, returned: int, sold: int, total_cents?: int|null}>  $lines
     * @param  list<array{method: string, amount_cents: int, mpesa_code?: string|null}>  $payments
     * @return array{approval: Approval, sale: Sale|null}
     */
    public function settle(User $actor, Approval $approval, array $lines, array $payments, string $note = ''): array
    {
        return DB::transaction(function () use ($actor, $approval, $lines, $payments, $note) {
            $locked = Approval::query()->whereKey($approval->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'open') {
                throw StockRuleViolation::on('lines', "{$locked->number} is already settled.");
            }

            $approvalLines = ApprovalLine::where('approval_id', $locked->id)->lockForUpdate()->get()->keyBy('id');
            $saleLines = [];
            $returnedAny = false;

            foreach ($lines as $i => $line) {
                $approvalLine = $approvalLines->get($line['approval_line_id']);
                if ($approvalLine === null) {
                    throw StockRuleViolation::on("lines.{$i}.approval_line_id", "That item is not on {$locked->number}.");
                }
                if ($approvalLine->outstanding() < $line['returned'] + $line['sold']) {
                    throw StockRuleViolation::on("lines.{$i}.returned", sprintf('Only %d of these are still out.', $approvalLine->outstanding()));
                }

                if ($line['returned'] > 0) {
                    $item = $this->items->lockedItem($approvalLine->stock_item_id);
                    $this->items->post($item, $line['returned'], 'return', $actor, 'approvals', $locked->id, "Back from {$locked->number}");
                    $approvalLine->quantity_returned += $line['returned'];
                    $returnedAny = true;
                }

                if ($line['sold'] > 0) {
                    $total = $line['total_cents'] ?? ($approvalLine->unit_price_cents !== null ? $approvalLine->unit_price_cents * $line['sold'] : null);
                    if ($total === null) {
                        throw StockRuleViolation::on("lines.{$i}.total_cents", 'Enter the agreed amount for the pieces sold.');
                    }
                    $saleLines[] = ['stock_item_id' => $approvalLine->stock_item_id, 'quantity' => $line['sold'], 'total_cents' => $total];
                    $approvalLine->quantity_sold += $line['sold'];
                }

                $approvalLine->save();
            }

            if ($saleLines === [] && ! $returnedAny) {
                throw StockRuleViolation::on('lines', 'Enter what came back or what was sold.');
            }
            if ($saleLines === [] && $payments !== []) {
                throw StockRuleViolation::on('payments', 'Nothing was sold, so there is nothing to pay.');
            }

            $sale = null;
            if ($saleLines !== []) {
                $sale = $this->sales->record($actor, [
                    'customer_id' => $locked->customer_id,
                    'note' => trim($note) !== '' ? trim($note) : "From {$locked->number}",
                    'lines' => $saleLines,
                    'payments' => $payments,
                ], $locked);
            }

            if ($approvalLines->every(fn (ApprovalLine $l) => $l->outstanding() === 0)) {
                $locked->update(['status' => 'closed', 'closed_at' => now()]);
            } else {
                $locked->touch();
            }

            Audit::record($actor, 'approval.settled', $locked, [
                'number' => $locked->number,
                'sale' => $sale?->number,
                'closed' => $locked->status === 'closed',
            ]);

            return ['approval' => $locked, 'sale' => $sale];
        });
    }
}
