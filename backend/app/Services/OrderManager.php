<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\Payment;
use App\Models\Roll;
use App\Models\StockItem;
use App\Models\User;
use App\Support\MpesaCodes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Custom orders. Fabric comes off its roll when work starts (the cut); finished products leave
 * the shelf when the order is collected; work lines (sewing, delivery, fitting) touch no stock.
 * Money: a deposit and part-payments while the order is open, the exact balance at collection.
 */
final class OrderManager
{
    public const MONEY_METHODS = ['cash', 'send_money', 'paybill'];

    public function __construct(
        private StockLedger $rolls,
        private StockItemLedger $items,
    ) {}

    /**
     * @param  list<array{kind: string, roll_id?: int|null, length_cm?: int|null, stock_item_id?: int|null, quantity?: int|null, description?: string|null, total_cents: int}>  $lines
     * @param  array{method: string, amount_cents: int, mpesa_code?: string|null}|null  $deposit
     */
    public function create(User $actor, Customer $customer, Carbon $dueOn, array $lines, string $note = '', ?array $deposit = null): Order
    {
        $total = array_sum(array_column($lines, 'total_cents'));
        if ($total <= 0) {
            throw StockRuleViolation::on('lines', 'The order needs a total above zero.');
        }
        if ($dueOn->lt(now(DayLedger::TIMEZONE)->startOfDay())) {
            throw StockRuleViolation::on('due_on', 'The due date cannot be in the past.');
        }
        if ($deposit !== null && $deposit['amount_cents'] > $total) {
            throw StockRuleViolation::on('deposit.amount_cents', 'The deposit cannot be more than the order total.');
        }

        return DB::transaction(function () use ($actor, $customer, $dueOn, $lines, $note, $deposit, $total) {
            $order = Order::create([
                'number' => sprintf('CO%05d', (int) DB::selectOne("SELECT nextval('order_number_seq') AS n")->n),
                'customer_id' => $customer->id,
                'due_on' => $dueOn->toDateString(),
                'total_cents' => $total,
                'note' => trim($note),
                'created_by' => $actor->id,
            ]);

            foreach ($lines as $i => $line) {
                OrderLine::create(['order_id' => $order->id] + $this->describe($line, $i));
            }

            if ($deposit !== null) {
                $this->takePayment($actor, $order, $deposit, 'deposit');
            }

            Audit::record($actor, 'order.taken', $order, [
                'number' => $order->number,
                'customer' => $customer->name,
                'total_cents' => $total,
                'deposit_cents' => $deposit['amount_cents'] ?? 0,
                'due_on' => $order->due_on->toDateString(),
            ]);

            return $order;
        });
    }

    /** @param array{method: string, amount_cents: int, mpesa_code?: string|null} $payment */
    public function pay(User $actor, Order $order, array $payment): Payment
    {
        return DB::transaction(function () use ($actor, $order, $payment) {
            $locked = $this->lock($order);
            if (! $locked->isActive()) {
                throw StockRuleViolation::on('amount_cents', "Order {$locked->number} is ".Order::STATUSES[$locked->status].'.');
            }
            $balance = $locked->total_cents - $locked->paidCents();
            if ($payment['amount_cents'] > $balance) {
                throw StockRuleViolation::on('amount_cents', sprintf('The balance on %s is only KES %s.', $locked->number, number_format($balance / 100)));
            }

            return $this->takePayment($actor, $locked, $payment, 'amount_cents');
        });
    }

    /** Work begins: the fabric for the order is cut from its rolls. */
    public function start(User $actor, Order $order): Order
    {
        return DB::transaction(function () use ($actor, $order) {
            $locked = $this->lock($order);
            if ($locked->status !== 'taken') {
                throw StockRuleViolation::on('status', "Order {$locked->number} is already ".strtolower(Order::STATUSES[$locked->status]).'.');
            }
            $this->cutFabric($actor, $locked);
            $locked->update(['status' => 'in_work', 'started_at' => now()]);
            Audit::record($actor, 'order.started', $locked, ['number' => $locked->number]);

            return $locked;
        });
    }

    public function ready(User $actor, Order $order): Order
    {
        return DB::transaction(function () use ($actor, $order) {
            $locked = $this->lock($order);
            if (! in_array($locked->status, ['taken', 'in_work'], true)) {
                throw StockRuleViolation::on('status', "Order {$locked->number} is ".strtolower(Order::STATUSES[$locked->status]).'.');
            }
            if ($locked->status === 'taken') {
                $this->cutFabric($actor, $locked);
                $locked->started_at = now();
            }
            $locked->update(['status' => 'ready', 'ready_at' => now()]);
            Audit::record($actor, 'order.ready', $locked, ['number' => $locked->number]);

            return $locked;
        });
    }

    /**
     * The customer takes the order. The payments must cover exactly what is still owed;
     * "account" puts some or all of it on their "to pay".
     *
     * @param  list<array{method: string, amount_cents: int, mpesa_code?: string|null}>  $payments
     */
    public function collect(User $actor, Order $order, array $payments): Order
    {
        return DB::transaction(function () use ($actor, $order, $payments) {
            $locked = $this->lock($order);
            if (! $locked->isActive()) {
                throw StockRuleViolation::on('status', "Order {$locked->number} is ".strtolower(Order::STATUSES[$locked->status]).'.');
            }
            $balance = $locked->total_cents - $locked->paidCents();
            $paying = array_sum(array_column($payments, 'amount_cents'));
            if ($paying !== $balance) {
                throw StockRuleViolation::on('payments', sprintf('The balance is KES %s but the payments add up to KES %s.', number_format($balance / 100), number_format($paying / 100)));
            }

            if ($locked->status === 'taken') {
                $this->cutFabric($actor, $locked);
                $locked->started_at = now();
            }

            $products = $locked->lines()->where('kind', 'product')->get();
            $ids = $products->pluck('stock_item_id')->unique()->sort()->values();
            $items = $ids->mapWithKeys(fn (int $id) => [$id => $this->items->lockedItem($id)]);
            foreach ($products as $line) {
                $item = $items[$line->stock_item_id];
                if ($item->tracks_stock) {
                    $this->items->post($item, -$line->quantity, 'sale', $actor, 'orders', $locked->id, "Order {$locked->number} collected", 'lines');
                }
            }

            foreach ($payments as $i => $payment) {
                $this->takePayment($actor, $locked, $payment, "payments.{$i}.mpesa_code", allowAccount: true);
            }

            $locked->update(['status' => 'collected', 'collected_at' => now(), 'ready_at' => $locked->ready_at ?? now()]);
            Audit::record($actor, 'order.collected', $locked, ['number' => $locked->number, 'balance_cents' => $balance]);

            return $locked;
        });
    }

    /** Called off. Fabric already cut stays cut; some or all of what was paid may be given back. */
    public function cancel(User $actor, Order $order, string $reason, ?string $refundMethod, int $refundCents): Order
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Say why the order is cancelled.');
        }

        return DB::transaction(function () use ($actor, $order, $reason, $refundMethod, $refundCents) {
            $locked = $this->lock($order);
            if (! $locked->isActive()) {
                throw StockRuleViolation::on('reason', "Order {$locked->number} is already ".strtolower(Order::STATUSES[$locked->status]).'.');
            }
            $paid = $locked->paidCents();
            if ($refundCents > $paid) {
                throw StockRuleViolation::on('refund_cents', sprintf('Only KES %s was paid on this order.', number_format($paid / 100)));
            }
            if ($refundCents > 0 && ! in_array($refundMethod, self::MONEY_METHODS, true)) {
                throw StockRuleViolation::on('refund_method', 'Say how the money was given back.');
            }

            $locked->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancel_reason' => $reason,
                'refund_method' => $refundCents > 0 ? $refundMethod : null,
                'refund_cents' => $refundCents,
            ]);
            Audit::record($actor, 'order.cancelled', $locked, [
                'number' => $locked->number,
                'reason' => $reason,
                'paid_cents' => $paid,
                'refund_cents' => $refundCents,
                'fabric_cut' => $locked->started_at !== null,
            ]);

            return $locked;
        });
    }

    private function lock(Order $order): Order
    {
        return Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
    }

    private function cutFabric(User $actor, Order $order): void
    {
        $fabric = $order->lines()->where('kind', 'fabric')->get();
        $ids = $fabric->pluck('roll_id')->unique()->sort()->values();
        $rolls = $ids->mapWithKeys(fn (int $id) => [$id => $this->rolls->lockedRoll($id)]);

        foreach ($fabric as $line) {
            $roll = $rolls[$line->roll_id];
            if ($roll->status === 'written_off') {
                throw StockRuleViolation::on('status', "Roll {$roll->tag} is written off; it cannot be cut for this order.");
            }
            try {
                $this->rolls->post($roll, -$line->length_cm, 'cut', $actor, 'orders', $order->id, "Cut for order {$order->number}");
            } catch (ValidationException $e) {
                throw StockRuleViolation::on('status', $e->getMessage());
            }
        }
    }

    /** @param array{method: string, amount_cents: int, mpesa_code?: string|null} $payment */
    private function takePayment(User $actor, Order $order, array $payment, string $field, bool $allowAccount = false): Payment
    {
        $allowed = $allowAccount ? [...self::MONEY_METHODS, 'account'] : self::MONEY_METHODS;
        if (! in_array($payment['method'], $allowed, true)) {
            throw StockRuleViolation::on($field, 'A deposit or part-payment must be cash or M-Pesa.');
        }
        $code = $payment['mpesa_code'] ?? null;
        if ($code !== null) {
            MpesaCodes::assertUnused($code, $field);
        }

        $created = Payment::create([
            'order_id' => $order->id,
            'customer_id' => $order->customer_id,
            'method' => $payment['method'],
            'amount_cents' => $payment['amount_cents'],
            'mpesa_code' => $code,
            'received_by' => $actor->id,
        ]);
        Audit::record($actor, 'order.payment', $created, ['order' => $order->number, 'amount_cents' => $created->amount_cents, 'method' => $created->method]);

        return $created;
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function describe(array $line, int $index): array
    {
        $note = trim((string) ($line['description'] ?? ''));

        if ($line['kind'] === 'fabric') {
            $roll = Roll::with(['fabric.colour', 'fabric.texture', 'fabric.materialType'])->findOrFail($line['roll_id']);
            if ($roll->status === 'written_off') {
                throw StockRuleViolation::on("lines.{$index}.roll_id", "Roll {$roll->tag} is written off.");
            }

            return [
                'kind' => 'fabric',
                'roll_id' => $roll->id,
                'length_cm' => $line['length_cm'],
                'description' => mb_substr(trim(sprintf('%s (roll %s)%s', $roll->fabric->displayName(), $roll->tag, $note !== '' ? " – {$note}" : '')), 0, 160),
                'total_cents' => $line['total_cents'],
            ];
        }

        if ($line['kind'] === 'product') {
            $item = StockItem::findOrFail($line['stock_item_id']);
            if (! $item->isProduct() || ! $item->active) {
                throw StockRuleViolation::on("lines.{$index}.stock_item_id", "{$item->name} is not for sale.");
            }

            return [
                'kind' => 'product',
                'stock_item_id' => $item->id,
                'quantity' => $line['quantity'],
                'description' => mb_substr($item->name.($note !== '' ? " – {$note}" : ''), 0, 160),
                'total_cents' => $line['total_cents'],
            ];
        }

        if ($note === '') {
            throw StockRuleViolation::on("lines.{$index}.description", 'Describe the work, e.g. Sewing 3 window sets, 2.6 m drop.');
        }

        return ['kind' => 'work', 'description' => mb_substr($note, 0, 160), 'total_cents' => $line['total_cents']];
    }
}
