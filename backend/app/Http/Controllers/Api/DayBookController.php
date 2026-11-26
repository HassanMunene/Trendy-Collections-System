<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\SaleReturn;
use App\Services\DayLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;

/**
 * One shop day, laid out like the paper sales book (name, item, quantity, mode, amount),
 * with what the book never had: totals per payment method, account payments, returns,
 * expenses, and the cash the drawer should hold at closing.
 */
class DayBookController extends Controller
{
    public const TIMEZONE = DayLedger::TIMEZONE;

    public function __invoke(Request $request, DayLedger $ledger): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate(['date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.now(self::TIMEZONE)->addDay()->toDateString()]]);

        $day = isset($data['date'])
            ? Carbon::createFromFormat('Y-m-d', $data['date'], self::TIMEZONE)->startOfDay()
            : now(self::TIMEZONE)->startOfDay();
        [$from, $to] = $ledger->range($day);
        $inDay = fn ($q, string $column = 'created_at') => $q->where($column, '>=', $from)->where($column, '<', $to);

        $sales = $inDay(Sale::with(SaleResource::RELATIONS))->orderBy('id')->get();
        $posted = $sales->where('status', 'posted');
        $payments = $posted->flatMap->payments;

        $byMethod = [];
        foreach (array_keys(Payment::METHODS) as $method) {
            $byMethod[$method] = (int) $payments->where('method', $method)->sum('amount_cents');
        }

        $belowAsking = $posted->flatMap->lines->sum(function (SaleLine $line) {
            $asking = $line->askingTotalCents();

            return $asking === null ? 0 : max(0, $asking - $line->total_cents);
        });

        $accountPayments = $inDay(Payment::with(['customer', 'receiver', 'voider'])->whereNull('sale_id')->whereNull('order_id'))->orderBy('id')->get();
        $orderPayments = $inDay(Payment::with(['customer', 'receiver', 'voider', 'order'])->whereNotNull('order_id'))->orderBy('id')->get();
        $returns = $inDay(SaleReturn::with(['sale.customer', 'lines.saleLine', 'creator']))->orderBy('id')->get();
        $expenses = $inDay(Expense::with(['recorder', 'voider']))->orderBy('id')->get();
        $money = $ledger->summary($day);

        return response()->json([
            'data' => [
                'date' => $day->toDateString(),
                'weekday' => $day->format('l'),
                'sales' => SaleResource::collection($sales)->resolve(),
                'account_payments' => $accountPayments->map(fn (Payment $p) => AccountPaymentController::present($p))->all(),
                'order_payments' => $orderPayments->map(fn (Payment $p) => AccountPaymentController::present($p) + ['order' => ['id' => $p->order->id, 'number' => $p->order->number]])->all(),
                'returns' => $returns->map(fn (SaleReturn $r) => [
                    'id' => $r->id,
                    'number' => $r->number,
                    'sale' => ['id' => $r->sale->id, 'number' => $r->sale->number],
                    'customer_name' => $r->sale->customer?->name ?? ($r->sale->customer_name ?: 'Customer'),
                    'items' => $r->lines->map(fn ($l) => ['description' => $l->saleLine->description, 'quantity' => $l->quantity, 'unit' => $l->saleLine->unit])->all(),
                    'refund_method' => $r->refund_method,
                    'refund_label' => SaleReturn::REFUND_METHODS[$r->refund_method],
                    'refund_cents' => $r->refund_cents,
                    'reason' => $r->reason,
                    'created_by' => ['id' => $r->creator->id, 'name' => $r->creator->name],
                    'created_at' => $r->created_at?->toIso8601String(),
                ])->all(),
                'expenses' => $expenses->map(fn (Expense $e) => ExpenseController::present($e))->all(),
                'totals' => [
                    'total_cents' => (int) $posted->sum('total_cents'),
                    'by_method' => $byMethod,
                    'method_labels' => Payment::METHODS,
                    'sales_count' => $posted->count(),
                    'voided_count' => $sales->count() - $posted->count(),
                    'missing_mpesa_codes' => $payments->whereIn('method', Payment::MPESA_METHODS)->whereNull('mpesa_code')->count()
                        + $accountPayments->concat($orderPayments)->whereNull('voided_at')->whereIn('method', Payment::MPESA_METHODS)->whereNull('mpesa_code')->count(),
                    'below_asking_cents' => (int) $belowAsking,
                ],
                'money' => [
                    'opening_cash_cents' => $money['opening_cash_cents'],
                    'sales_in' => $money['sales_in'],
                    'account_payments_in' => $money['account_payments_in'],
                    'order_payments_in' => $money['order_payments_in'],
                    'refunds_out' => $money['refunds_out'],
                    'expenses_out' => $money['expenses_out'],
                    'net_by_method' => $money['net_by_method'],
                    'put_on_account_cents' => $money['put_on_account_cents'],
                    'credited_to_accounts_cents' => $money['credited_to_accounts_cents'],
                    'expected_cash_cents' => $money['expected_cash_cents'],
                    'count' => $money['count'] ? CashCountController::present($money['count']) : null,
                ],
            ],
        ]);
    }
}
