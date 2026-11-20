<?php

namespace App\Exceptions;

use Illuminate\Validation\ValidationException;

/** A business rule refused the request; rendered as a 422 with a field message. */
final class StockRuleViolation
{
    public static function on(string $field, string $message): ValidationException
    {
        return ValidationException::withMessages([$field => $message]);
    }
}
