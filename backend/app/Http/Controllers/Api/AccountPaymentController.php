<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Payment;
use App\Services\AccountPaymentRecorder;
use App\Support\CustomerBalance;
use App\Support\MpesaCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** A customer paying off "to pay" debt, and voiding such a payment. */
class AccountPaymentController extends Controller
{
    public function store(Request $request, Customer $customer, AccountPaymentRecorder $recorder): JsonResponse
    {
        Gate::authorize('sell');
        $data = $request->validate([
            'method' => ['required', Rule::in(['cash', 'send_money', 'paybill'])],
            'amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'mpesa_code' => ['nullable', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $code = MpesaCodes::clean($data['mpesa_code'] ?? null);
        if ($code !== null && $data['method'] === 'cash') {
            throw ValidationException::withMessages(['mpesa_code' => 'Only M-Pesa payments have a code.']);
        }
        if ($code !== null && ! MpesaCodes::looksValid($code)) {
            throw ValidationException::withMessages(['mpesa_code' => 'An M-Pesa code is 10 letters and numbers, e.g. TKL3X9ABCD.']);
        }

        $payment = $recorder->record($request->user(), $customer, $data['method'], (int) $data['amount_cents'], $code, (string) ($data['note'] ?? ''));

        return response()->json(['data' => self::present($payment->load('receiver')) + ['owed_after_cents' => CustomerBalance::owed($customer)]], 201);
    }

    public function void(Request $request, Payment $payment, AccountPaymentRecorder $recorder): JsonResponse
    {
        Gate::authorize('void-sales');
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $voided = $recorder->void($request->user(), $payment, $data['reason']);

        return response()->json(['data' => self::present($voided->load(['receiver', 'voider']))]);
    }

    /** @return array<string, mixed> */
    public static function present(Payment $p): array
    {
        return [
            'id' => $p->id,
            'customer' => $p->relationLoaded('customer') && $p->customer ? ['id' => $p->customer->id, 'name' => $p->customer->name, 'stall' => $p->customer->stall] : null,
            'method' => $p->method,
            'method_label' => Payment::METHODS[$p->method],
            'amount_cents' => $p->amount_cents,
            'mpesa_code' => $p->mpesa_code,
            'note' => $p->note,
            'received_by' => $p->relationLoaded('receiver') ? ['id' => $p->receiver->id, 'name' => $p->receiver->name] : null,
            'voided' => $p->voided_at !== null,
            'voided_by' => $p->relationLoaded('voider') && $p->voider ? ['id' => $p->voider->id, 'name' => $p->voider->name] : null,
            'void_reason' => $p->void_reason,
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}
