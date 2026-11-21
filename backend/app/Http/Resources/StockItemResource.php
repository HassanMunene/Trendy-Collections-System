<?php

namespace App\Http\Resources;

use App\Models\StockItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin StockItem */
class StockItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $canSeeCosts = Gate::allows('view-costs');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'sku' => $this->sku,
            'unit' => $this->unit,
            'quantity' => $this->quantity,
            'reorder_level' => $this->reorder_level,
            'cost_cents' => $this->when($canSeeCosts, $this->cost_cents),
            'supplier' => $this->when($canSeeCosts, fn () => new SupplierResource($this->whenLoaded('supplier'))),
            'location' => $this->location,
            'notes' => $this->notes,
            'active' => $this->active,
            'is_low' => $this->isLow(),
            'received_by' => $this->whenLoaded('receiver', fn () => ['id' => $this->receiver->id, 'name' => $this->receiver->name]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
