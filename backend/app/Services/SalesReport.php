<?php

namespace App\Services;

use App\Models\Fabric;
use App\Support\CustomerBalance;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * How the shop did between two dates (inclusive, Nairobi days): sales, returns, custom orders,
 * best sellers, money in and out, expenses and staff, plus who owes the shop today.
 *
 * Sales count on the day they were made; returns, expenses and refunds on the day they happened.
 * Voided records never count.
 */
final class SalesReport
{
    private const TZ = DayLedger::TIMEZONE;

    /** Ranges longer than this are charted by month instead of by day. */
    public const DAILY_CHART_MAX_DAYS = 62;

    public function __construct(private DayLedger $ledger) {}

    /**
     * @return array<string, mixed>
     */
    public function build(Carbon $fromDay, Carbon $toDay, bool $withCosts): array
    {
        $from = $fromDay->copy()->setTimezone(self::TZ)->startOfDay();
        $to = $toDay->copy()->setTimezone(self::TZ)->startOfDay()->addDay();
        $range = [$from->copy()->utc(), $to->copy()->utc()];

        $money = $this->ledger->moneyBetween(...$range);
        $sum = fn (array $byMethod) => array_sum($byMethod);
        $moneyIn = $sum($money['sales_in']) + $sum($money['order_payments_in']) + $sum($money['account_payments_in']);
        $moneyOut = $sum($money['refunds_out']) + $sum($money['expenses_out']);

        $sales = DB::selectOne(
            "SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS total FROM sales WHERE status = 'posted' AND created_at >= ? AND created_at < ?",
            $range,
        );
        $returns = DB::selectOne(<<<'SQL'
            SELECT COUNT(DISTINCT r.id) AS n,
                   COALESCE(SUM(ROUND(sl.total_cents::numeric * rl.quantity / sl.quantity)), 0) AS goods,
                   (SELECT COALESCE(SUM(refund_cents), 0) FROM sale_returns WHERE created_at >= ? AND created_at < ?) AS refunded
            FROM sale_returns r
            JOIN sale_return_lines rl ON rl.sale_return_id = r.id
            JOIN sale_lines sl ON sl.id = rl.sale_line_id
            WHERE r.created_at >= ? AND r.created_at < ?
            SQL, [...$range, ...$range]);

        $expenses = collect(DB::select(<<<'SQL'
            SELECT category, COUNT(*) AS n, SUM(amount_cents) AS total
            FROM expenses WHERE voided_at IS NULL AND created_at >= ? AND created_at < ?
            GROUP BY category ORDER BY total DESC
            SQL, $range))->map(fn ($r) => ['category' => $r->category, 'count' => (int) $r->n, 'total_cents' => (int) $r->total]);
        $expensesTotal = $expenses->sum('total_cents');

        $data = [
            'from' => $from->toDateString(),
            'to' => $to->copy()->subDay()->toDateString(),
            'days' => (int) $from->diffInDays($to),
            'sales' => [
                'count' => (int) $sales->n,
                'total_cents' => (int) $sales->total,
                'average_cents' => $sales->n > 0 ? intdiv((int) $sales->total, (int) $sales->n) : 0,
                'returns_count' => (int) $returns->n,
                'returned_goods_cents' => (int) $returns->goods,
                'refunded_cents' => (int) $returns->refunded,
                'net_cents' => (int) $sales->total - (int) $returns->goods,
            ],
            'orders' => $this->orders($range),
            'money' => [
                ...$money,
                'in_cents' => $moneyIn,
                'out_cents' => $moneyOut,
                'net_cents' => $moneyIn - $moneyOut,
            ],
            'chart' => $this->chart($from, $to, $range),
            'categories' => $this->categories($range),
            'top_products' => $this->topProducts($range),
            'top_fabrics' => $this->topFabrics($range),
            'expenses' => ['total_cents' => $expensesTotal, 'by_category' => $expenses->values()->all()],
            'staff' => collect(DB::select(<<<'SQL'
                SELECT u.id, u.name, COUNT(*) AS n, SUM(s.total_cents) AS total
                FROM sales s JOIN users u ON u.id = s.sold_by
                WHERE s.status = 'posted' AND s.created_at >= ? AND s.created_at < ?
                GROUP BY u.id, u.name ORDER BY total DESC
                SQL, $range))->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'count' => (int) $r->n, 'total_cents' => (int) $r->total])->all(),
            'debtors' => $this->debtors(),
        ];

        if ($withCosts) {
            $data['profit'] = $this->profit($range, $expensesTotal);
        }

        return $data;
    }

    /**
     * Sale lines of posted sales in the range, with how many of each were brought back later.
     */
    private function linesSql(): string
    {
        return <<<'SQL'
            WITH lines AS (
                SELECT sl.*, COALESCE(rt.qty, 0) AS returned_qty,
                       sl.total_cents - COALESCE(ROUND(sl.total_cents::numeric * rt.qty / sl.quantity), 0) AS net_cents
                FROM sale_lines sl
                JOIN sales s ON s.id = sl.sale_id
                LEFT JOIN (SELECT sale_line_id, SUM(quantity) AS qty FROM sale_return_lines GROUP BY sale_line_id) rt ON rt.sale_line_id = sl.id
                WHERE s.status = 'posted' AND s.created_at >= ? AND s.created_at < ?
            )
            SQL;
    }

    /**
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return list<array{name: string, quantity: int|null, length_cm: int|null, total_cents: int}>
     */
    private function categories(array $range): array
    {
        $rows = DB::select($this->linesSql().<<<'SQL'
            SELECT COALESCE(pc.name, CASE WHEN l.kind = 'fabric' THEN 'Fabric by the metre' ELSE 'Other' END) AS name,
                   l.kind,
                   SUM(l.quantity - l.returned_qty) AS quantity,
                   SUM(l.length_cm) AS length_cm,
                   SUM(l.net_cents) AS total
            FROM lines l
            LEFT JOIN stock_items si ON si.id = l.stock_item_id
            LEFT JOIN product_categories pc ON pc.id = si.product_category_id
            GROUP BY 1, 2 ORDER BY total DESC
            SQL, $range);

        return array_map(fn ($r) => [
            'name' => $r->name,
            'quantity' => $r->kind === 'product' ? (int) $r->quantity : null,
            'length_cm' => $r->kind === 'fabric' ? (int) $r->length_cm : null,
            'total_cents' => (int) $r->total,
        ], $rows);
    }

    /**
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return list<array{stock_item_id: int, name: string, category: string|null, unit: string, quantity: int, total_cents: int}>
     */
    public function topProducts(array $range): array
    {
        $rows = DB::select($this->linesSql().<<<'SQL'
            SELECT l.stock_item_id, (array_agg(l.description ORDER BY l.id DESC))[1] AS name,
                   (array_agg(l.unit ORDER BY l.id DESC))[1] AS unit, pc.name AS category,
                   SUM(l.quantity - l.returned_qty) AS quantity, SUM(l.net_cents) AS total
            FROM lines l
            JOIN stock_items si ON si.id = l.stock_item_id
            LEFT JOIN product_categories pc ON pc.id = si.product_category_id
            WHERE l.kind = 'product'
            GROUP BY l.stock_item_id, pc.name
            HAVING SUM(l.quantity - l.returned_qty) > 0
            ORDER BY total DESC, quantity DESC LIMIT 10
            SQL, $range);

        return array_map(fn ($r) => [
            'stock_item_id' => (int) $r->stock_item_id,
            'name' => $r->name,
            'category' => $r->category,
            'unit' => $r->unit,
            'quantity' => (int) $r->quantity,
            'total_cents' => (int) $r->total,
        ], $rows);
    }

    /**
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return list<array{fabric_id: int, name: string, code: string, length_cm: int, total_cents: int}>
     */
    private function topFabrics(array $range): array
    {
        $rows = collect(DB::select($this->linesSql().<<<'SQL'
            SELECT r.fabric_id, SUM(l.length_cm) AS length_cm, SUM(l.net_cents) AS total
            FROM lines l JOIN rolls r ON r.id = l.roll_id
            WHERE l.kind = 'fabric'
            GROUP BY r.fabric_id ORDER BY total DESC LIMIT 10
            SQL, $range));
        $fabrics = Fabric::with(['colour', 'texture', 'materialType'])->whereIn('id', $rows->pluck('fabric_id'))->get()->keyBy('id');

        return $rows->map(fn ($r) => [
            'fabric_id' => (int) $r->fabric_id,
            'name' => $fabrics->get($r->fabric_id)?->displayName() ?? '',
            'code' => $fabrics->get($r->fabric_id)?->code ?? '',
            'length_cm' => (int) $r->length_cm,
            'total_cents' => (int) $r->total,
        ])->all();
    }

    /**
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return array<string, int>
     */
    private function orders(array $range): array
    {
        $o = DB::selectOne(<<<'SQL'
            SELECT
              COUNT(*) FILTER (WHERE created_at >= ? AND created_at < ?) AS taken,
              COALESCE(SUM(total_cents) FILTER (WHERE created_at >= ? AND created_at < ?), 0) AS taken_total,
              COUNT(*) FILTER (WHERE collected_at >= ? AND collected_at < ?) AS collected,
              COALESCE(SUM(total_cents) FILTER (WHERE collected_at >= ? AND collected_at < ?), 0) AS collected_total,
              COUNT(*) FILTER (WHERE cancelled_at >= ? AND cancelled_at < ?) AS cancelled,
              COUNT(*) FILTER (WHERE status IN ('taken', 'in_work', 'ready')) AS open,
              COALESCE(SUM(total_cents - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = orders.id AND p.voided_at IS NULL), 0))
                       FILTER (WHERE status IN ('taken', 'in_work', 'ready')), 0) AS open_balance
            FROM orders
            SQL, [...$range, ...$range, ...$range, ...$range, ...$range]);

        return [
            'taken_count' => (int) $o->taken,
            'taken_cents' => (int) $o->taken_total,
            'collected_count' => (int) $o->collected,
            'collected_cents' => (int) $o->collected_total,
            'cancelled_count' => (int) $o->cancelled,
            'open_count' => (int) $o->open,
            'open_balance_cents' => (int) $o->open_balance,
        ];
    }

    /**
     * Sales, money in and expenses per day (or per month for long ranges), with empty days filled in.
     *
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return array{bucket: string, points: list<array{date: string, sales_cents: int, sales_count: int, money_in_cents: int, expenses_cents: int}>}
     */
    private function chart(Carbon $from, Carbon $to, array $range): array
    {
        $bucket = $from->diffInDays($to) > self::DAILY_CHART_MAX_DAYS ? 'month' : 'day';
        $key = fn (string $column) => "to_char(date_trunc('{$bucket}', {$column} AT TIME ZONE '".self::TZ."'), 'YYYY-MM-DD')";

        $sales = collect(DB::select(
            "SELECT {$key('created_at')} AS k, COUNT(*) AS n, SUM(total_cents) AS total FROM sales WHERE status = 'posted' AND created_at >= ? AND created_at < ? GROUP BY 1",
            $range,
        ))->keyBy('k');
        $in = collect(DB::select(
            "SELECT {$key('created_at')} AS k, SUM(amount_cents) AS total FROM payments WHERE voided_at IS NULL AND method <> 'account' AND created_at >= ? AND created_at < ? GROUP BY 1",
            $range,
        ))->pluck('total', 'k');
        $out = collect(DB::select(
            "SELECT {$key('created_at')} AS k, SUM(amount_cents) AS total FROM expenses WHERE voided_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY 1",
            $range,
        ))->pluck('total', 'k');

        $points = [];
        $cursor = $bucket === 'month' ? $from->copy()->startOfMonth() : $from->copy();
        while ($cursor->lt($to)) {
            $k = $cursor->toDateString();
            $points[] = [
                'date' => $k,
                'sales_cents' => (int) ($sales[$k]->total ?? 0),
                'sales_count' => (int) ($sales[$k]->n ?? 0),
                'money_in_cents' => (int) ($in[$k] ?? 0),
                'expenses_cents' => (int) ($out[$k] ?? 0),
            ];
            $bucket === 'month' ? $cursor->addMonthNoOverflow() : $cursor->addDay();
        }

        return ['bucket' => $bucket, 'points' => $points];
    }

    /**
     * A rough gross profit: what sales and collected orders brought in, less what the goods cost
     * (each product's cost price today, each roll's cost per metre). Sewing pay and other running
     * costs are expenses, taken off afterwards.
     *
     * @param  array{0: Carbon, 1: Carbon}  $range
     * @return array{revenue_cents: int, cost_cents: int, gross_cents: int, expenses_cents: int, after_expenses_cents: int, lines_without_cost: int}
     */
    private function profit(array $range, int $expensesCents): array
    {
        $sales = DB::selectOne($this->linesSql().<<<'SQL'
            SELECT COALESCE(SUM(l.net_cents), 0) AS revenue,
                   COALESCE(SUM(CASE WHEN l.kind = 'product' THEN (l.quantity - l.returned_qty) * si.cost_cents
                                     ELSE ROUND(r.cost_cents::numeric * l.length_cm / r.received_cm) END), 0) AS cost,
                   COUNT(*) FILTER (WHERE COALESCE(si.cost_cents, r.cost_cents) = 0) AS missing
            FROM lines l
            LEFT JOIN stock_items si ON si.id = l.stock_item_id
            LEFT JOIN rolls r ON r.id = l.roll_id
            SQL, $range);

        $orders = DB::selectOne(<<<'SQL'
            SELECT COALESCE((SELECT SUM(total_cents) FROM orders WHERE collected_at >= ? AND collected_at < ?), 0) AS revenue,
                   COALESCE(SUM(CASE WHEN ol.kind = 'product' THEN ol.quantity * si.cost_cents
                                     WHEN ol.kind = 'fabric' THEN ROUND(r.cost_cents::numeric * ol.length_cm / r.received_cm)
                                     ELSE 0 END), 0) AS cost,
                   COUNT(*) FILTER (WHERE ol.kind <> 'work' AND COALESCE(si.cost_cents, r.cost_cents) = 0) AS missing
            FROM order_lines ol
            JOIN orders o ON o.id = ol.order_id
            LEFT JOIN stock_items si ON si.id = ol.stock_item_id
            LEFT JOIN rolls r ON r.id = ol.roll_id
            WHERE o.collected_at >= ? AND o.collected_at < ?
            SQL, [...$range, ...$range]);

        $revenue = (int) $sales->revenue + (int) $orders->revenue;
        $cost = (int) $sales->cost + (int) $orders->cost;

        return [
            'revenue_cents' => $revenue,
            'cost_cents' => $cost,
            'gross_cents' => $revenue - $cost,
            'expenses_cents' => $expensesCents,
            'after_expenses_cents' => $revenue - $cost - $expensesCents,
            'lines_without_cost' => (int) $sales->missing + (int) $orders->missing,
        ];
    }

    /**
     * Everyone who owes the shop today, largest first.
     *
     * @return array{count: int, total_cents: int, customers: list<array{id: int, name: string, stall: string, phone: string|null, owed_cents: int}>}
     */
    public function debtors(): array
    {
        $rows = collect(DB::select(
            'SELECT * FROM (SELECT c.id, c.name, c.stall, c.phone, '.CustomerBalance::owedSql('c.id').' AS owed FROM customers c) t WHERE owed > 0 ORDER BY owed DESC'
        ));

        return [
            'count' => $rows->count(),
            'total_cents' => (int) $rows->sum('owed'),
            'customers' => $rows->take(25)->map(fn ($r) => [
                'id' => (int) $r->id,
                'name' => $r->name,
                'stall' => $r->stall,
                'phone' => $r->phone,
                'owed_cents' => (int) $r->owed,
            ])->values()->all(),
        ];
    }
}
