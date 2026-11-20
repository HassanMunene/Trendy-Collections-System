<?php

namespace App\Http\Resources;

use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StockMovement */
class MovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'change_cm' => $this->change_cm,
            'balance_after_cm' => $this->balance_after_cm,
            'note' => $this->note,
            'actor' => $this->whenLoaded('actor', fn () => ['id' => $this->actor->id, 'name' => $this->actor->name]),
            'roll' => $this->whenLoaded('roll', fn () => ['id' => $this->roll->id, 'tag' => $this->roll->tag]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
