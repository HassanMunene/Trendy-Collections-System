<?php

namespace App\Support;

/**
 * Kenyan mobile numbers. Staff type them as 0712 345 678, +254712345678 or 254712345678;
 * we store one form, 254712345678, which is also what Safaricom Daraja expects.
 */
final class Phone
{
    public static function normalize(?string $input): ?string
    {
        if ($input === null) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $input) ?? '';
        if ($digits === '') {
            return null;
        }
        if (preg_match('/^0([17]\d{8})$/', $digits, $m)) {
            return '254'.$m[1];
        }
        if (preg_match('/^([17]\d{8})$/', $digits, $m)) {
            return '254'.$m[1];
        }
        if (preg_match('/^254[17]\d{8}$/', $digits)) {
            return $digits;
        }

        return null;
    }

    public static function looksLikePhone(string $input): bool
    {
        return preg_match('/^[\d\s+()-]{9,}$/', trim($input)) === 1;
    }
}
