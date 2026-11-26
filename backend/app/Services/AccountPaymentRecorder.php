<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\User;
use App\Support\CustomerBalance;
use App\Support\MpesaCodes;
use Illuminate\Support\Facades\DB;

/** A customer paying off what they took on "to pay"; also voids account and order payments. */
final class AccountPaymentRecorder
{
    public function record(User $actor, Customer $customer, string $method, int $amountCents, ?string $mpesaCode, string $note = ''): Payment
    {
        return DB::transaction(function () use ($actor, $customer, $method, $amountCents, $mpesaCode, $note) {
            // One payment at a time per customer, so two phones cannot both clear the same debt.
            $locked = Customer::query()->whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $owed = CustomerBalance::owed($locked);

            if ($owed <= 0) {
                throw StockRuleViolation::on('amount_cents', "{$locked->name} does not owe anything.");
            }
            if ($amountCents > $owed) {
                throw StockRuleViolation::on('amount_cents', sprintf('%s only owes KES %s.', $locked->name, number_format($owed / 100)));
            }
            if ($mpesaCode !== null) {
                MpesaCodes::assertUnused($mpesaCode, 'mpesa_code');
            }

            $payment = Payment::create([
                'customer_id' => $locked->id,
                'method' => $method,
                'amount_cents' => $amountCents,
                'mpesa_code' => $mpesaCode,
                'note' => trim($note),
                'received_by' => $actor->id,
            ]);

            Audit::record($actor, 'account_payment.recorded', $payment, [
                'customer' => $locked->name,
                'amount_cents' => $amountCents,
                'method' => $method,
                'owed_before_cents' => $owed,
            ]);

            return $payment;
        });
    }

    public function void(User $actor, Payment $payment, string $reason): Payment
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Say why the payment is being voided.');
        }
        if ($payment->sale_id !== null) {
            throw StockRuleViolation::on('reason', 'A sale payment is voided together with its sale.');
        }

        return DB::transaction(function () use ($actor, $payment, $reason) {
            $locked = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($locked->order_id !== null && ! $locked->order()->firstOrFail()->isActive()) {
                throw StockRuleViolation::on('reason', 'Payments on a collected or cancelled order cannot be voided.');
            }
            if ($locked->voided_at !== null) {
                throw StockRuleViolation::on('reason', 'This payment is already voided.');
            }
            $locked->update(['voided_at' => now(), 'voided_by' => $actor->id, 'void_reason' => $reason]);
            Audit::record($actor, 'account_payment.voided', $locked, ['amount_cents' => $locked->amount_cents, 'reason' => $reason]);

            return $locked;
        });
    }
}
