<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;

/** @mixin Customer */
class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'stall' => $this->stall,
            'notes' => $this->notes,
            'active' => $this->active,
            // To-pay sales minus account payments and account-credited returns (App\Support\CustomerBalance).
            'owed_cents' => (int) ($this->owed_cents ?? 0),
            'last_sale_at' => $this->last_sale_at ? Carbon::parse($this->last_sale_at)->toIso8601String() : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
