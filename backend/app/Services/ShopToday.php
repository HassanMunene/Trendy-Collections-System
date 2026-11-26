<?php

namespace App\Services;

use App\Models\Approval;
use App\Models\CashCount;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\StockItem;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;

/**
 * The home screen: what the shop is doing right now, for someone who may be checking from home.
 *
 *  - today: money so far against the same time last week, and the drawer;
 *  - attention: short list of things to act on, each with a link to the exact screen;
 *  - month: this month so far against last month, best seller, money owed;
 *  - recent_sales and work (orders to sew).
 *
 * Each part is only built for accounts allowed to see it.
 */
final class ShopToday
{
    private const TZ = DayLedger::TIMEZONE;

    /** A sale this far under the asking price is worth a look (prices are always bargained, so not less). */
    public const DEEP_DISCOUNT_SHARE = 0.20;

    /** How many single items one kind of alert lists before summing up the rest. */
    private const LIST_LIMIT = 3;

    public function __construct(private DayLedger $ledger, private SalesReport $report) {}

    /** @return array<string, mixed> */
    public function build(User $user): array
    {
        $gate = Gate::forUser($user);
        $now = now(self::TZ);
        $data = [];

        if ($gate->allows('sell')) {
            $data['today'] = $this->today($now);
            $data['recent_sales'] = $this->recentSales();
        }
        if ($gate->allows('view-reports')) {
            $data['month'] = $this->month($now);
        }
        if ($gate->allows('record-sewing')) {
            $data['work'] = $this->work();
        }
        $data['attention'] = $this->attention($now, $gate->allows('view-reports'), $gate->allows('sell'), $gate->allows('record-sewing'));

        return $data;
    }

    /** @return array<string, mixed> */
    private function today(Carbon $now): array
    {
        $day = $now->copy()->startOfDay();
        $summary = $this->ledger->summary($day);
        $sales = Sale::posted()->where('created_at', '>=', $day->copy()->utc());
        $lastWeekStart = $day->copy()->subWeek();
        $lastWeek = Sale::posted()->where('created_at', '>=', $lastWeekStart->copy()->utc())->where('created_at', '<', $now->copy()->subWeek()->utc());
        $in = fn (string $m) => $summary['sales_in'][$m] + $summary['order_payments_in'][$m] + $summary['account_payments_in'][$m];

        return [
            'date' => $day->toDateString(),
            'sales_count' => (clone $sales)->count(),
            'sales_cents' => (int) (clone $sales)->sum('total_cents'),
            'last_week_weekday' => $lastWeekStart->format('l'),
            'last_week_same_time_cents' => (int) $lastWeek->sum('total_cents'),
            'in_by_method' => ['cash' => $in('cash'), 'send_money' => $in('send_money'), 'paybill' => $in('paybill')],
            'expenses_cents' => array_sum($summary['expenses_out']),
            'put_on_account_cents' => $summary['put_on_account_cents'],
            'expected_cash_cents' => $summary['expected_cash_cents'],
            'count' => $summary['count'] ? [
                'counted_cents' => $summary['count']->counted_cents,
                'difference_cents' => $summary['count']->counted_cents - $summary['count']->expected_cents,
                'counted_by' => $summary['count']->counter?->name,
            ] : null,
        ];
    }

    /** @return array<string, mixed> */
    private function month(Carbon $now): array
    {
        $start = $now->copy()->startOfMonth();
        $lastStart = $start->copy()->subMonthNoOverflow();
        // Last month up to the same day and time, so a half month is compared with a half month.
        $lastSameTime = $lastStart->copy()->setDay(min($now->day, $lastStart->daysInMonth))->setTimeFrom($now);
        $salesBetween = fn (Carbon $from, Carbon $to) => (int) Sale::posted()->where('created_at', '>=', $from->copy()->utc())->where('created_at', '<', $to->copy()->utc())->sum('total_cents');
        $weekRange = [$now->copy()->startOfDay()->subDays(6)->utc(), $now->copy()->utc()];
        $debtors = $this->report->debtors();

        return [
            'name' => $now->format('F'),
            'sales_cents' => $salesBetween($start, $now->copy()->startOfDay()->addDay()),
            'last_month_name' => $lastStart->format('F'),
            'last_month_same_time_cents' => $salesBetween($lastStart, $lastSameTime),
            'best_seller_week' => $this->report->topProducts($weekRange)[0] ?? null,
            'owed_cents' => $debtors['total_cents'],
            'owing_customers' => $debtors['count'],
            'top_debtor' => $debtors['customers'][0] ?? null,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function recentSales(): array
    {
        return Sale::with(['seller', 'customer', 'payments', 'lines'])->orderByDesc('id')->limit(6)->get()
            ->map(fn (Sale $s) => [
                'id' => $s->id,
                'number' => $s->number,
                'status' => $s->status,
                'date' => $s->created_at->setTimezone(self::TZ)->toDateString(),
                'created_at' => $s->created_at?->toIso8601String(),
                'total_cents' => $s->total_cents,
                'customer' => $s->customer?->name ?? ($s->customer_name ?: null),
                'seller' => $s->seller?->name,
                'items' => $s->lines->map(fn (SaleLine $l) => $l->kind === 'fabric'
                    ? sprintf('%s m %s', rtrim(rtrim(number_format($l->length_cm / 100, 2), '0'), '.'), $l->description)
                    : "{$l->quantity} × {$l->description}")->join(', '),
                'methods' => $s->payments->pluck('method')->unique()->values()->all(),
            ])->all();
    }

    /** Orders for the workroom, soonest due first. @return list<array<string, mixed>> */
    private function work(): array
    {
        return Order::with(['customer', 'lines'])->whereIn('status', ['taken', 'in_work'])->orderBy('due_on')->orderBy('id')->limit(6)->get()
            ->map(fn (Order $o) => [
                'id' => $o->id,
                'number' => $o->number,
                'status' => $o->status,
                'customer' => $o->customer?->name,
                'due_on' => $o->due_on->toDateString(),
                'overdue' => $o->isOverdue(),
                'items' => $o->lines->pluck('description')->join(', '),
            ])->all();
    }

    /**
     * Things to act on, most serious first.
     *
     * @return list<array{key: string, tone: string, title: string, detail: string, link: string}>
     */
    private function attention(Carbon $now, bool $owner, bool $sells, bool $sews): array
    {
        $alerts = [];
        $today = $now->copy()->startOfDay();
        $todayUtc = $today->copy()->utc();
        $dayLink = fn (Carbon|string $d, ?int $sale = null) => '/day-book?date='.($d instanceof Carbon ? $d->toDateString() : $d).($sale ? "&sale={$sale}" : '');
        $add = function (string $key, string $tone, string $title, string $detail, string $link) use (&$alerts) {
            $alerts[] = compact('key', 'tone', 'title', 'detail', 'link');
        };

        if ($owner) {
            // The last cash count, if it did not match.
            $count = CashCount::with('counter')->where('business_date', '>=', $today->copy()->subDays(3)->toDateString())
                ->orderByDesc('business_date')->orderByDesc('id')->first();
            if ($count && $count->counted_cents !== $count->expected_cents) {
                $diff = $count->counted_cents - $count->expected_cents;
                $add('cash-count', $diff < 0 ? 'danger' : 'warn',
                    sprintf('Cash count %s %s %s', $this->dayName($count->business_date), $diff < 0 ? 'was short by' : 'was over by', $this->kes(abs($diff))),
                    sprintf('Counted by %s. The drawer should have had %s.', $count->counter?->name ?? 'staff', $this->kes($count->expected_cents)),
                    $dayLink($this->localDate($count->business_date)));
            }

            // Yesterday had money moving but nobody counted the drawer.
            $yesterday = $today->copy()->subDay();
            [$yFrom, $yTo] = $this->ledger->range($yesterday);
            $yesterdayHadCash = Payment::whereNull('voided_at')->where('method', 'cash')->where('created_at', '>=', $yFrom)->where('created_at', '<', $yTo)->exists();
            if ($yesterdayHadCash && ! CashCount::whereDate('business_date', $yesterday->toDateString())->exists()) {
                $add('not-counted', 'warn', 'Yesterday\'s cash was not counted', 'Nobody closed the day, so a shortage would go unnoticed.', $dayLink($yesterday));
            }

            $voided = Sale::with('voider')->where('status', 'voided')->where('voided_at', '>=', $todayUtc)->orderByDesc('voided_at')->get();
            foreach ($voided->take(self::LIST_LIMIT) as $sale) {
                $add("void-{$sale->id}", 'danger', sprintf('Sale %s (%s) was voided', $sale->number, $this->kes($sale->total_cents)),
                    sprintf('By %s: "%s"', $sale->voider?->name ?? 'staff', $sale->void_reason),
                    $dayLink($sale->created_at->setTimezone(self::TZ)->toDateString(), $sale->id));
            }
            if ($voided->count() > self::LIST_LIMIT) {
                $add('voids-more', 'danger', sprintf('%d more sales voided today', $voided->count() - self::LIST_LIMIT), 'See them in the day book.', $dayLink($today));
            }

            $sales = Sale::posted()->with(['lines', 'seller'])->where('created_at', '>=', $todayUtc)->get();
            $deep = $sales->map(function (Sale $s) {
                $asking = $s->lines->sum(fn (SaleLine $l) => $l->askingTotalCents() ?? $l->total_cents);

                return ['sale' => $s, 'asking' => $asking, 'off' => $asking - $s->total_cents];
            })->filter(fn ($x) => $x['asking'] > 0 && $x['off'] >= $x['asking'] * self::DEEP_DISCOUNT_SHARE)->sortByDesc('off');
            foreach ($deep->take(self::LIST_LIMIT) as $x) {
                $add("discount-{$x['sale']->id}", 'warn',
                    sprintf('Sale %s went %s under the asking price', $x['sale']->number, $this->kes($x['off'])),
                    sprintf('Sold for %s instead of %s (%d%% off) by %s.', $this->kes($x['sale']->total_cents), $this->kes($x['asking']), round($x['off'] / $x['asking'] * 100), $x['sale']->seller?->name ?? 'staff'),
                    $dayLink($today, $x['sale']->id));
            }

            $missing = Payment::whereNull('voided_at')->whereIn('method', Payment::MPESA_METHODS)->whereNull('mpesa_code')->where('created_at', '>=', $todayUtc)->count();
            if ($missing > 0) {
                $add('mpesa-codes', 'warn', sprintf('%d M-Pesa %s without a code today', $missing, $missing === 1 ? 'payment' : 'payments'),
                    'Without the code, the money cannot be checked against the M-Pesa statement.', $dayLink($today));
            }
        }

        if ($sells) {
            $ready = Order::with('customer')->where('status', 'ready')->orderBy('ready_at')->get();
            if ($ready->count() === 1) {
                $o = $ready->first();
                $add('orders-ready', 'info', sprintf('%s\'s order is ready to collect', $o->customer?->name), sprintf('Order %s. Call %s.', $o->number, $o->customer?->phone ? $this->phone($o->customer->phone) : 'them'), "/orders?order={$o->id}");
            } elseif ($ready->count() > 1) {
                $add('orders-ready', 'info', sprintf('%d orders are ready to collect', $ready->count()), 'Call the customers: '.$ready->take(4)->map(fn ($o) => $o->customer?->name)->join(', ').'.', '/orders?show=ready');
            }

            $approvals = Approval::open()->with('customer')->where('due_on', '<', $today->toDateString())->orderBy('due_on')->get();
            foreach ($approvals->take(self::LIST_LIMIT) as $a) {
                $days = (int) $a->created_at->setTimezone(self::TZ)->startOfDay()->diffInDays($today);
                $add("approval-{$a->id}", 'warn', sprintf('%s has kept goods %d days', $this->customerLabel($a->customer), $days),
                    sprintf('%s was due back %s. Ask for the goods or the money.', $a->number, $this->dayName($a->due_on)), "/approvals?approval={$a->id}");
            }
            if ($approvals->count() > self::LIST_LIMIT) {
                $add('approvals-more', 'warn', sprintf('%d more shops are past their week', $approvals->count() - self::LIST_LIMIT), 'See everything out on approval.', '/approvals');
            }
        }

        if ($sells || $sews) {
            $late = Order::with('customer')->whereIn('status', ['taken', 'in_work'])->where('due_on', '<', $today->toDateString())->orderBy('due_on')->get();
            foreach ($late->take(self::LIST_LIMIT) as $o) {
                $days = (int) $this->localDate($o->due_on)->diffInDays($today);
                $add("order-late-{$o->id}", 'danger', sprintf('%s\'s order is %d %s late', $o->customer?->name, $days, $days === 1 ? 'day' : 'days'),
                    sprintf('Order %s, %s.', $o->number, $o->status === 'taken' ? 'not started yet' : 'being made'), "/orders?order={$o->id}");
            }
            if ($late->count() > self::LIST_LIMIT) {
                $add('orders-late-more', 'danger', sprintf('%d more orders are late', $late->count() - self::LIST_LIMIT), 'See all orders in progress.', '/orders');
            }

            $soon = Order::where('status', 'taken')->whereBetween('due_on', [$today->toDateString(), $today->copy()->addDays(2)->toDateString()])->count();
            if ($soon > 0) {
                $add('orders-soon', 'info', sprintf('%d %s due within 2 days not started yet', $soon, $soon === 1 ? 'order' : 'orders'), 'The fabric has not been cut for these.', '/orders');
            }
        }

        $out = StockItem::products()->where('tracks_stock', true)->where('active', true)->where('quantity', 0)->count();
        if ($out > 0) {
            $add('out-of-stock', 'warn', sprintf('%d %s sold out', $out, $out === 1 ? 'product is' : 'products are'), 'Sew or restock before customers ask.', '/products?show=out');
        }
        $low = StockItem::products()->low()->where('quantity', '>', 0)->count();
        if ($low > 0) {
            $add('low-stock', 'info', sprintf('%d %s running low', $low, $low === 1 ? 'product is' : 'products are'), 'At or under their alert level.', '/products?show=low');
        }

        $order = ['danger' => 0, 'warn' => 1, 'info' => 2];
        usort($alerts, fn ($a, $b) => $order[$a['tone']] <=> $order[$b['tone']]);

        return $alerts;
    }

    private function kes(int $cents): string
    {
        return 'KES '.number_format($cents / 100, $cents % 100 === 0 ? 0 : 2);
    }

    private function phone(string $phone): string
    {
        return preg_match('/^254(\d{3})(\d{3})(\d{3})$/', $phone, $m) ? "0{$m[1]} {$m[2]} {$m[3]}" : $phone;
    }

    /** A stored calendar date (or date string) as midnight in the shop's time zone. */
    private function localDate(DateTimeInterface|string $date): Carbon
    {
        return Carbon::parse($date instanceof DateTimeInterface ? $date->format('Y-m-d') : $date, self::TZ)->startOfDay();
    }

    private function dayName(DateTimeInterface|string $date): string
    {
        $d = $this->localDate($date);
        $today = now(self::TZ)->startOfDay();

        return match (true) {
            $d->equalTo($today) => 'today',
            $d->equalTo($today->copy()->subDay()) => 'yesterday',
            default => 'on '.$d->format('D j M'),
        };
    }

    private function customerLabel(?Customer $customer): string
    {
        if (! $customer) {
            return 'A shop';
        }

        return $customer->stall !== '' ? "{$customer->name} ({$customer->stall})" : $customer->name;
    }
}
