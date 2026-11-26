<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\CashCount;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Payment;
use App\Models\SaleReturn;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The money side of one shop day (Africa/Nairobi): what came in by each method, what went out
 * as refunds and expenses, and how much cash the drawer should hold at closing.
 */
final class DayLedger
{
    public const TIMEZONE = 'Africa/Nairobi';

    public const MONEY_METHODS = ['cash', 'send_money', 'paybill'];

    /**
     * @return array{
     *     opening_cash_cents: int,
     *     sales_in: array<string, int>, order_payments_in: array<string, int>, account_payments_in: array<string, int>,
     *     refunds_out: array<string, int>, expenses_out: array<string, int>,
     *     put_on_account_cents: int, credited_to_accounts_cents: int,
     *     net_by_method: array<string, int>, expected_cash_cents: int,
     *     count: CashCount|null
     * }
     */
    public function summary(Carbon $day): array
    {
        [$from, $to] = $this->range($day);
        $money = $this->moneyBetween($from, $to);
        $opening = $this->openingCash($day);

        return [
            'opening_cash_cents' => $opening,
            ...$money,
            'expected_cash_cents' => $opening + $money['net_by_method']['cash'],
            'count' => CashCount::with('counter')->whereDate('business_date', $day->toDateString())->orderByDesc('id')->first(),
        ];
    }

    /**
     * Money in and out by method between two instants: one shop day here, any range in reports.
     *
     * @return array{
     *     sales_in: array<string, int>, order_payments_in: array<string, int>, account_payments_in: array<string, int>,
     *     refunds_out: array<string, int>, expenses_out: array<string, int>,
     *     put_on_account_cents: int, credited_to_accounts_cents: int,
     *     net_by_method: array<string, int>
     * }
     */
    public function moneyBetween(Carbon $from, Carbon $to): array
    {
        $zero = array_fill_keys(self::MONEY_METHODS, 0);

        $byMethod = fn ($query, string $column) => array_replace($zero, $query->groupBy('method')
            ->selectRaw("method, SUM({$column}) AS total")->pluck('total', 'method')
            ->map(fn ($v) => (int) $v)->only(self::MONEY_METHODS)->all());

        $payments = fn () => Payment::query()->whereNull('voided_at')->where('created_at', '>=', $from)->where('created_at', '<', $to);

        $salesIn = $byMethod($payments()->whereNotNull('sale_id'), 'amount_cents');
        $ordersIn = $byMethod($payments()->whereNotNull('order_id'), 'amount_cents');
        $accountIn = $byMethod($payments()->whereNull('sale_id')->whereNull('order_id'), 'amount_cents');
        $putOnAccount = (int) $payments()->where('method', 'account')->sum('amount_cents');

        $returns = fn () => SaleReturn::query()->where('created_at', '>=', $from)->where('created_at', '<', $to);
        $refundsOut = array_replace($zero, $returns()->groupBy('refund_method')
            ->selectRaw('refund_method, SUM(refund_cents) AS total')->pluck('total', 'refund_method')
            ->map(fn ($v) => (int) $v)->only(self::MONEY_METHODS)->all());
        // Deposits given back on cancelled orders leave on the day of cancelling.
        $orderRefunds = Order::query()->where('cancelled_at', '>=', $from)->where('cancelled_at', '<', $to)->where('refund_cents', '>', 0)
            ->groupBy('refund_method')->selectRaw('refund_method, SUM(refund_cents) AS total')->pluck('total', 'refund_method');
        foreach ($orderRefunds as $method => $amount) {
            $refundsOut[$method] += (int) $amount;
        }
        $credited = (int) $returns()->where('refund_method', 'account')->sum('refund_cents');

        $expensesOut = $byMethod(Expense::query()->whereNull('voided_at')->where('created_at', '>=', $from)->where('created_at', '<', $to), 'amount_cents');

        $net = [];
        foreach (self::MONEY_METHODS as $m) {
            $net[$m] = $salesIn[$m] + $ordersIn[$m] + $accountIn[$m] - $refundsOut[$m] - $expensesOut[$m];
        }

        return [
            'sales_in' => $salesIn,
            'order_payments_in' => $ordersIn,
            'account_payments_in' => $accountIn,
            'refunds_out' => $refundsOut,
            'expenses_out' => $expensesOut,
            'put_on_account_cents' => $putOnAccount,
            'credited_to_accounts_cents' => $credited,
            'net_by_method' => $net,
        ];
    }

    public function close(User $actor, Carbon $day, int $countedCents, int $keptCents, string $note = ''): CashCount
    {
        if ($day->copy()->startOfDay()->gt(now(self::TIMEZONE)->startOfDay())) {
            throw StockRuleViolation::on('date', 'A day can only be closed once it has started.');
        }
        if ($keptCents > $countedCents) {
            throw StockRuleViolation::on('kept_cents', 'You cannot leave more in the drawer than you counted.');
        }

        return DB::transaction(function () use ($actor, $day, $countedCents, $keptCents, $note) {
            // Serialise counts so two phones closing at once both see the same expected amount.
            DB::select('SELECT pg_advisory_xact_lock(?)', [crc32('cash_count')]);
            $expected = $this->summary($day)['expected_cash_cents'];

            $count = CashCount::create([
                'business_date' => $day->toDateString(),
                'expected_cents' => $expected,
                'counted_cents' => $countedCents,
                'kept_cents' => $keptCents,
                'note' => trim($note),
                'counted_by' => $actor->id,
            ]);

            Audit::record($actor, 'day.closed', $count, [
                'date' => $day->toDateString(),
                'expected_cents' => $expected,
                'counted_cents' => $countedCents,
                'difference_cents' => $countedCents - $expected,
                'kept_cents' => $keptCents,
            ]);

            return $count;
        });
    }

    /** Cash left in the drawer at the last count before this day (the float), or 0. */
    public function openingCash(Carbon $day): int
    {
        return (int) (CashCount::query()
            ->whereDate('business_date', '<', $day->toDateString())
            ->orderByDesc('business_date')->orderByDesc('id')
            ->value('kept_cents') ?? 0);
    }

    /** @return array{0: Carbon, 1: Carbon} UTC start and end of the Nairobi day */
    public function range(Carbon $day): array
    {
        $start = $day->copy()->setTimezone(self::TIMEZONE)->startOfDay();

        return [$start->copy()->utc(), $start->copy()->addDay()->utc()];
    }
}
