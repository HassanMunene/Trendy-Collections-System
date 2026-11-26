<?php

namespace App\Support;

/** The name staff see for a product, built from what defines it: "Window curtain – Grey · Blackout". */
final class ProductName
{
    public static function make(string $category, ?string $colour, string $variant = ''): string
    {
        $details = array_filter([trim((string) $colour), trim($variant)], fn (string $part) => $part !== '');

        return $details === [] ? $category : $category.' – '.implode(' · ', $details);
    }
}
