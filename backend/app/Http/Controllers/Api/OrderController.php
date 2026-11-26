<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Services\DayLedger;
use App\Services\OrderManager;
use App\Support\MpesaCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Made-to-measure orders: taken with a deposit, sewn, ready, collected with the balance. */
class OrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeWorkroom();
        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['active', 'ready', 'done', 'all'])],
            'customer_id' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:80'],
        ]);
        $status = $filters['status'] ?? 'active';

        $orders = Order::with(OrderResource::RELATIONS)
            ->when($status === 'active', fn ($q) => $q->whereIn('status', ['taken', 'in_work']))
            ->when($status === 'ready', fn ($q) => $q->where('status', 'ready'))
            ->when($status === 'done', fn ($q) => $q->whereIn('status', ['collected', 'cancelled']))
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($filters['q'] ?? null, function ($q, string $term) {
                $like = '%'.addcslashes(trim($term), '%_\\').'%';
                $q->where(fn ($q) => $q->where('number', 'ilike', $like)->orWhereHas('customer', fn ($c) => $c->where('name', 'ilike', $like)));
            })
            ->orderBy(in_array($status, ['active', 'ready'], true) ? 'due_on' : 'id', in_array($status, ['active', 'ready'], true) ? 'asc' : 'desc')
            ->limit(200)
            ->get();

        return OrderResource::collection($orders);
    }

    public function show(Order $order): OrderResource
    {
        $this->authorizeWorkroom();

        return new OrderResource($order->load(OrderResource::RELATIONS));
    }

    public function store(Request $request, OrderManager $manager): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'customer_id' => ['required', 'integer', Rule::exists('customers', 'id')->where('active', true)],
            'due_on' => ['required', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1', 'max:30'],
            'lines.*.kind' => ['required', Rule::in(['fabric', 'product', 'work'])],
            'lines.*.roll_id' => ['required_if:lines.*.kind,fabric', 'nullable', 'integer', 'exists:rolls,id'],
            'lines.*.length_cm' => ['required_if:lines.*.kind,fabric', 'nullable', 'integer', 'min:1', 'max:100000'],
            'lines.*.stock_item_id' => ['required_if:lines.*.kind,product', 'nullable', 'integer', 'exists:stock_items,id'],
            'lines.*.quantity' => ['required_if:lines.*.kind,product', 'nullable', 'integer', 'min:1', 'max:10000'],
            'lines.*.description' => ['nullable', 'string', 'max:160'],
            'lines.*.total_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'deposit' => ['nullable', 'array'],
            'deposit.method' => ['required_with:deposit', Rule::in(OrderManager::MONEY_METHODS)],
            'deposit.amount_cents' => ['required_with:deposit', 'integer', 'min:1', 'max:10000000000'],
            'deposit.mpesa_code' => ['nullable', 'string', 'max:20'],
        ], ['customer_id.required' => 'Choose the customer; custom orders need a name and ideally a phone.']);

        $order = $manager->create(
            $request->user(),
            Customer::findOrFail($data['customer_id']),
            Carbon::createFromFormat('Y-m-d', $data['due_on'], DayLedger::TIMEZONE)->startOfDay(),
            array_map(fn (array $l) => [
                'kind' => $l['kind'],
                'roll_id' => isset($l['roll_id']) ? (int) $l['roll_id'] : null,
                'length_cm' => isset($l['length_cm']) ? (int) $l['length_cm'] : null,
                'stock_item_id' => isset($l['stock_item_id']) ? (int) $l['stock_item_id'] : null,
                'quantity' => isset($l['quantity']) ? (int) $l['quantity'] : null,
                'description' => $l['description'] ?? null,
                'total_cents' => (int) $l['total_cents'],
            ], $data['lines']),
            (string) ($data['note'] ?? ''),
            isset($data['deposit']) ? $this->payment($data['deposit'], 'deposit.mpesa_code') : null,
        );

        return (new OrderResource($order->load(OrderResource::RELATIONS)))->response()->setStatusCode(201);
    }

    public function pay(Request $request, Order $order, OrderManager $manager): OrderResource
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'method' => ['required', Rule::in(OrderManager::MONEY_METHODS)],
            'amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'mpesa_code' => ['nullable', 'string', 'max:20'],
        ]);
        $manager->pay($request->user(), $order, $this->payment($data, 'mpesa_code'));

        return new OrderResource($order->refresh()->load(OrderResource::RELATIONS));
    }

    public function start(Request $request, Order $order, OrderManager $manager): OrderResource
    {
        $this->authorizeWorkroom();

        return new OrderResource($manager->start($request->user(), $order)->load(OrderResource::RELATIONS));
    }

    public function ready(Request $request, Order $order, OrderManager $manager): OrderResource
    {
        $this->authorizeWorkroom();

        return new OrderResource($manager->ready($request->user(), $order)->load(OrderResource::RELATIONS));
    }

    public function collect(Request $request, Order $order, OrderManager $manager): OrderResource
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'payments' => ['present', 'array', 'max:6'],
            'payments.*.method' => ['required', Rule::in(array_keys(Payment::METHODS))],
            'payments.*.amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'payments.*.mpesa_code' => ['nullable', 'string', 'max:20'],
        ]);
        $payments = [];
        foreach ($data['payments'] as $i => $p) {
            $payments[] = $this->payment($p, "payments.{$i}.mpesa_code");
        }

        return new OrderResource($manager->collect($request->user(), $order, $payments)->load(OrderResource::RELATIONS));
    }

    public function cancel(Request $request, Order $order, OrderManager $manager): OrderResource
    {
        Gate::authorize('void-sales');
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
            'refund_method' => ['nullable', Rule::in(OrderManager::MONEY_METHODS)],
            'refund_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
        ]);

        return new OrderResource($manager->cancel($request->user(), $order, $data['reason'], $data['refund_method'] ?? null, (int) $data['refund_cents'])->load(OrderResource::RELATIONS));
    }

    /** Selling staff take orders and money; tailors also see orders and move them along. */
    private function authorizeWorkroom(): void
    {
        if (! Gate::any(['sell', 'record-sewing'])) {
            abort(403);
        }
    }

    /**
     * @param  array<string, mixed>  $p
     * @return array{method: string, amount_cents: int, mpesa_code: string|null}
     */
    private function payment(array $p, string $field): array
    {
        $code = MpesaCodes::clean($p['mpesa_code'] ?? null);
        if ($code !== null && ! in_array($p['method'], Payment::MPESA_METHODS, true)) {
            throw ValidationException::withMessages([$field => 'Only M-Pesa payments have a code.']);
        }
        if ($code !== null && ! MpesaCodes::looksValid($code)) {
            throw ValidationException::withMessages([$field => 'An M-Pesa code is 10 letters and numbers, e.g. TKL3X9ABCD.']);
        }

        return ['method' => (string) $p['method'], 'amount_cents' => (int) $p['amount_cents'], 'mpesa_code' => $code];
    }
}
