<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\OrderResource;
use App\Http\Resources\SaleResource;
use App\Models\CatalogueTerm;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Sale;
use App\Services\Audit;
use App\Support\CustomerBalance;
use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Regulars and neighbouring shops. Walk-ins never need an account. */
class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('sell');
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:80'],
            'owing' => ['nullable', 'boolean'],
        ]);

        $customers = $this->withTotals(Customer::query())
            ->where('active', true)
            ->when($filters['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.addcslashes(trim($term), '%_\\').'%';
                $digits = preg_replace('/\D+/', '', $term) ?? '';
                $q->where(fn (Builder $q) => $q->where('name', 'ilike', $like)
                    ->orWhere('stall', 'ilike', $like)
                    ->when(strlen($digits) >= 4, fn (Builder $q) => $q->orWhere('phone', 'like', '%'.ltrim($digits, '0').'%')));
            })
            ->orderByRaw('last_sale_at DESC NULLS LAST')
            ->orderBy('name')
            ->limit(200)
            ->get()
            ->when($filters['owing'] ?? false, fn ($all) => $all->filter(fn (Customer $c) => $c->owed_cents > 0)->values());

        return CustomerResource::collection($customers);
    }

    public function show(Customer $customer): JsonResponse
    {
        Gate::authorize('sell');
        $customer = $this->withTotals(Customer::query())->whereKey($customer->id)->firstOrFail();
        $sales = Sale::with(['lines', 'payments', 'seller', 'returns'])
            ->where('customer_id', $customer->id)
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        $accountPayments = Payment::with(['receiver', 'voider'])
            ->whereNull('sale_id')
            ->where('customer_id', $customer->id)
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => (new CustomerResource($customer))->resolve(),
            'sales' => SaleResource::collection($sales)->resolve(),
            'account_payments' => $accountPayments->map(fn (Payment $p) => AccountPaymentController::present($p))->all(),
            'orders' => OrderResource::collection(
                Order::with(['lines', 'payments'])->where('customer_id', $customer->id)->orderByDesc('id')->limit(20)->get()
            )->resolve(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('sell');
        $data = $this->validated($request, null);
        $customer = Customer::create($data + ['created_by' => $request->user()->id]);
        Audit::record($request->user(), 'customer.created', $customer, ['name' => $customer->name, 'stall' => $customer->stall]);

        return (new CustomerResource($customer))->response()->setStatusCode(201);
    }

    public function update(Request $request, Customer $customer): CustomerResource
    {
        Gate::authorize('sell');
        $data = $this->validated($request, $customer);
        $customer->update($data);
        Audit::record($request->user(), 'customer.updated', $customer, ['name' => $customer->name]);

        return new CustomerResource($this->withTotals(Customer::query())->whereKey($customer->id)->firstOrFail());
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Customer $customer): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:20'],
            'stall' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $phone = trim((string) ($data['phone'] ?? ''));
        if ($phone !== '' && Phone::normalize($phone) === null) {
            throw ValidationException::withMessages(['phone' => 'Enter a Kenyan mobile number, e.g. 0712 345 678.']);
        }

        $name = CatalogueTerm::clean($data['name']);
        $stall = CatalogueTerm::clean((string) ($data['stall'] ?? ''));
        $taken = Customer::where('name', $name)->where('stall', $stall)
            ->when($customer, fn (Builder $q) => $q->whereKeyNot($customer->id))
            ->exists();
        if ($taken) {
            throw ValidationException::withMessages(['name' => $stall === '' ? "{$name} is already a customer." : "{$name} at {$stall} is already a customer."]);
        }

        return [
            'name' => $name,
            'phone' => $phone === '' ? null : $phone,
            'stall' => $stall,
            'notes' => trim((string) ($data['notes'] ?? '')),
        ] + (array_key_exists('active', $data) ? ['active' => $data['active']] : []);
    }

    /**
     * @param  Builder<Customer>  $query
     * @return Builder<Customer>
     */
    private function withTotals(Builder $query): Builder
    {
        return $query->select('customers.*')
            ->selectRaw(CustomerBalance::owedSql().' AS owed_cents')
            ->selectSub(
                Sale::query()->whereColumn('sales.customer_id', 'customers.id')->where('status', 'posted')->selectRaw('MAX(created_at)'),
                'last_sale_at'
            );
    }
}
