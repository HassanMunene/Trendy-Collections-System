<?php

namespace App\Enums;

enum Role: string
{
    case Owner = 'owner';
    case Manager = 'manager';
    case Cashier = 'cashier';
    case Cutter = 'cutter';
    case Tailor = 'tailor';

    public function label(): string
    {
        return ucfirst($this->value);
    }
}
