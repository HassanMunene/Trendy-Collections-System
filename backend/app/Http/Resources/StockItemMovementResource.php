<?php

namespace App\Http\Resources;

use App\Models\StockItemMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StockItemMovement */
class StockItemMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'change_qty' => $this->change_qty,
            'balance_after' => $this->balance_after,
            'note' => $this->note,
            'actor' => $this->whenLoaded('actor', fn () => ['id' => $this->actor->id, 'name' => $this->actor->name]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
