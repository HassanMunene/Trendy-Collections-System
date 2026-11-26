<?php

namespace App\Support;

use App\Exceptions\StockRuleViolation;
use App\Models\Payment;

/** One M-Pesa transaction can only be counted once, whether it paid a sale or an account. */
final class MpesaCodes
{
    /** "tkl3x9 abcd" -> "TKL3X9ABCD"; blank -> null. */
    public static function clean(?string $code): ?string
    {
        $clean = strtoupper(preg_replace('/\s+/', '', (string) $code) ?? '');

        return $clean === '' ? null : $clean;
    }

    public static function looksValid(string $code): bool
    {
        return preg_match('/^[A-Z0-9]{8,12}$/', $code) === 1;
    }

    public static function assertUnused(string $code, string $field): void
    {
        $used = Payment::with(['sale:id,number', 'order:id,number', 'customer:id,name'])
            ->where('mpesa_code', $code)
            ->whereNull('voided_at')
            ->first();

        if ($used) {
            throw StockRuleViolation::on($field, match (true) {
                $used->sale !== null => "M-Pesa code {$code} is already on sale {$used->sale->number}.",
                $used->order !== null => "M-Pesa code {$code} is already on order {$used->order->number}.",
                default => "M-Pesa code {$code} is already recorded as a payment from {$used->customer?->name}.",
            });
        }
    }
}
