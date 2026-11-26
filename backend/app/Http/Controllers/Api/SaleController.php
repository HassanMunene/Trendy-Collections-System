<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Services\SaleRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SaleController extends Controller
{
    public function store(Request $request, SaleRecorder $recorder): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', Rule::exists('customers', 'id')->where('active', true)],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'note' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.stock_item_id' => ['nullable', 'required_without:lines.*.roll_id', 'prohibits:lines.*.roll_id', 'integer', 'exists:stock_items,id'],
            'lines.*.quantity' => ['required_with:lines.*.stock_item_id', 'nullable', 'integer', 'min:1', 'max:100000'],
            'lines.*.roll_id' => ['nullable', 'integer', 'exists:rolls,id'],
            'lines.*.length_cm' => ['required_with:lines.*.roll_id', 'nullable', 'integer', 'min:1', 'max:100000'],
            'lines.*.total_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'payments' => ['present', 'array', 'max:6'],
            'payments.*.method' => ['required', Rule::in(array_keys(Payment::METHODS))],
            'payments.*.amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'payments.*.mpesa_code' => ['nullable', 'string', 'max:20'],
        ], [
            'lines.required' => 'Add at least one item.',
            'lines.*.stock_item_id.prohibits' => 'A line is either a product or fabric from a roll, not both.',
        ]);

        foreach ($data['payments'] as $i => &$payment) {
            $code = strtoupper(preg_replace('/\s+/', '', (string) ($payment['mpesa_code'] ?? '')) ?? '');
            if ($code === '') {
                $payment['mpesa_code'] = null;

                continue;
            }
            if (! in_array($payment['method'], Payment::MPESA_METHODS, true)) {
                throw ValidationException::withMessages(["payments.{$i}.mpesa_code" => 'Only M-Pesa payments have a code.']);
            }
            if (! preg_match('/^[A-Z0-9]{8,12}$/', $code)) {
                throw ValidationException::withMessages(["payments.{$i}.mpesa_code" => 'An M-Pesa code is 10 letters and numbers, e.g. TKL3X9ABCD.']);
            }
            $payment['mpesa_code'] = $code;
        }
        unset($payment);

        // Keep only the fields that belong to each kind of line.
        $data['lines'] = array_map(fn (array $line) => isset($line['stock_item_id'])
            ? ['stock_item_id' => (int) $line['stock_item_id'], 'quantity' => (int) $line['quantity'], 'total_cents' => (int) $line['total_cents']]
            : ['roll_id' => (int) $line['roll_id'], 'length_cm' => (int) $line['length_cm'], 'total_cents' => (int) $line['total_cents']],
            $data['lines']);

        $sale = $recorder->record($request->user(), $data);

        return (new SaleResource($sale->load(['customer', 'seller', 'lines', 'payments'])))->response()->setStatusCode(201);
    }

    public function show(Sale $sale): SaleResource
    {
        Gate::authorize('sell');

        return new SaleResource($sale->load(SaleResource::RELATIONS));
    }

    public function void(Request $request, Sale $sale, SaleRecorder $recorder): SaleResource
    {
        Gate::authorize('void-sales');
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $voided = $recorder->void($request->user(), $sale, $data['reason']);

        return new SaleResource($voided->load(SaleResource::RELATIONS));
    }

    /**
     * Bargaining help: what this customer paid last time for the item, and the item's recent prices.
     */
    public function priceHint(Request $request): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'stock_item_id' => ['required', 'integer'],
            'customer_id' => ['nullable', 'integer'],
        ]);

        $recent = fn () => SaleLine::query()
            ->join('sales', 'sales.id', '=', 'sale_lines.sale_id')
            ->where('sales.status', 'posted')
            ->where('sale_lines.stock_item_id', $data['stock_item_id'])
            ->orderByDesc('sale_lines.id')
            ->select('sale_lines.quantity', 'sale_lines.total_cents', 'sales.created_at', 'sales.customer_id');

        $unitPrice = fn ($row) => [
            'unit_cents' => intdiv((int) $row->total_cents, max(1, (int) $row->quantity)),
            'quantity' => (int) $row->quantity,
            'total_cents' => (int) $row->total_cents,
            'sold_at' => Carbon::parse($row->created_at)->toIso8601String(),
        ];

        $last = isset($data['customer_id'])
            ? $recent()->where('sales.customer_id', $data['customer_id'])->first()
            : null;

        return response()->json(['data' => [
            'customer_last' => $last ? $unitPrice($last) : null,
            'customer' => isset($data['customer_id']) ? Customer::whereKey($data['customer_id'])->value('name') : null,
            'recent' => $recent()->limit(5)->get()->map($unitPrice)->all(),
        ]]);
    }
}
