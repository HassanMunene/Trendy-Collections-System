<?php

namespace App\Http\Resources;

use App\Models\Roll;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin Roll */
class RollResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $canSeeCosts = Gate::allows('view-costs');

        return [
            'id' => $this->id,
            'tag' => $this->tag,
            'fabric' => new FabricResource($this->whenLoaded('fabric')),
            'supplier' => $this->when($canSeeCosts, fn () => new SupplierResource($this->whenLoaded('supplier'))),
            'stated_cm' => $this->stated_cm,
            'received_cm' => $this->received_cm,
            'balance_cm' => $this->balance_cm,
            // Purchase cost is owner/manager information only.
            'cost_cents' => $this->when($canSeeCosts, $this->cost_cents),
            'dye_lot' => $this->dye_lot,
            'invoice_ref' => $this->when($canSeeCosts, $this->invoice_ref),
            'purchase_date' => $this->purchase_date?->toDateString(),
            'location' => $this->location,
            'included_services' => $this->included_services,
            'remnant_alert_cm' => $this->remnant_alert_cm,
            'notes' => $this->notes,
            'status' => $this->status,
            'is_low' => $this->relationLoaded('fabric') ? $this->isLow() : null,
            'received_by' => $this->whenLoaded('receiver', fn () => ['id' => $this->receiver->id, 'name' => $this->receiver->name]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
