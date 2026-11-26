<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalResource;
use App\Http\Resources\SaleResource;
use App\Models\Approval;
use App\Models\Customer;
use App\Models\Payment;
use App\Services\ApprovalManager;
use App\Support\MpesaCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Goods on approval to neighbouring shops: one week at most, then back or paid for. */
class ApprovalController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('sell');
        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'closed', 'all'])],
            'customer_id' => ['nullable', 'integer'],
        ]);
        $status = $filters['status'] ?? 'open';

        $approvals = Approval::with(ApprovalResource::RELATIONS)
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('customer_id', $id))
            ->orderBy($status === 'open' ? 'due_on' : 'id', $status === 'open' ? 'asc' : 'desc')
            ->limit(200)
            ->get();

        return ApprovalResource::collection($approvals);
    }

    public function show(Approval $approval): ApprovalResource
    {
        Gate::authorize('sell');

        return new ApprovalResource($approval->load(ApprovalResource::RELATIONS));
    }

    public function store(Request $request, ApprovalManager $manager): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'customer_id' => ['required', 'integer', Rule::exists('customers', 'id')->where('active', true)],
            'note' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.stock_item_id' => ['required', 'integer', 'distinct', 'exists:stock_items,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
            'lines.*.unit_price_cents' => ['nullable', 'integer', 'min:0', 'max:10000000000'],
        ], ['customer_id.required' => 'Choose the shop taking the goods.', 'lines.required' => 'Add what is going out.']);

        $approval = $manager->issue(
            $request->user(),
            Customer::findOrFail($data['customer_id']),
            array_map(fn (array $l) => [
                'stock_item_id' => (int) $l['stock_item_id'],
                'quantity' => (int) $l['quantity'],
                'unit_price_cents' => isset($l['unit_price_cents']) ? (int) $l['unit_price_cents'] : null,
            ], $data['lines']),
            (string) ($data['note'] ?? ''),
        );

        return (new ApprovalResource($approval->load(ApprovalResource::RELATIONS)))->response()->setStatusCode(201);
    }

    /** What came back and what was sold; the sold part becomes a sale (paid now or "to pay"). */
    public function settle(Request $request, Approval $approval, ApprovalManager $manager): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.approval_line_id' => ['required', 'integer', 'distinct'],
            'lines.*.returned' => ['required', 'integer', 'min:0', 'max:10000'],
            'lines.*.sold' => ['required', 'integer', 'min:0', 'max:10000'],
            'lines.*.total_cents' => ['nullable', 'integer', 'min:0', 'max:10000000000'],
            'payments' => ['present', 'array', 'max:6'],
            'payments.*.method' => ['required', Rule::in(array_keys(Payment::METHODS))],
            'payments.*.amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'payments.*.mpesa_code' => ['nullable', 'string', 'max:20'],
        ]);

        $payments = [];
        foreach ($data['payments'] as $i => $p) {
            $code = MpesaCodes::clean($p['mpesa_code'] ?? null);
            if ($code !== null && ! in_array($p['method'], Payment::MPESA_METHODS, true)) {
                throw ValidationException::withMessages(["payments.{$i}.mpesa_code" => 'Only M-Pesa payments have a code.']);
            }
            if ($code !== null && ! MpesaCodes::looksValid($code)) {
                throw ValidationException::withMessages(["payments.{$i}.mpesa_code" => 'An M-Pesa code is 10 letters and numbers, e.g. TKL3X9ABCD.']);
            }
            $payments[] = ['method' => $p['method'], 'amount_cents' => (int) $p['amount_cents'], 'mpesa_code' => $code];
        }

        $result = $manager->settle(
            $request->user(),
            $approval,
            array_map(fn (array $l) => [
                'approval_line_id' => (int) $l['approval_line_id'],
                'returned' => (int) $l['returned'],
                'sold' => (int) $l['sold'],
                'total_cents' => isset($l['total_cents']) ? (int) $l['total_cents'] : null,
            ], $data['lines']),
            $payments,
            (string) ($data['note'] ?? ''),
        );

        return response()->json([
            'data' => (new ApprovalResource($result['approval']->load(ApprovalResource::RELATIONS)))->resolve(),
            'sale' => $result['sale'] ? (new SaleResource($result['sale']->load(SaleResource::RELATIONS)))->resolve() : null,
        ]);
    }
}
