<?php

namespace App\Http\Resources;

use App\Models\Fabric;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Fabric */
class FabricResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'display_name' => $this->displayName(),
            'category' => new TermResource($this->whenLoaded('category')),
            'material_type' => new TermResource($this->whenLoaded('materialType')),
            'texture' => new TermResource($this->whenLoaded('texture')),
            'colour' => new TermResource($this->whenLoaded('colour')),
            'design' => $this->design,
            'shade_code' => $this->shade_code,
            'opacity' => $this->opacity,
            'width_cm' => $this->width_cm,
            'weight_gsm' => $this->weight_gsm,
            'care_instructions' => $this->care_instructions,
            'retail_price_cents_per_m' => $this->retail_price_cents_per_m,
            'reorder_threshold_cm' => $this->reorder_threshold_cm,
            'active' => $this->active,
            'rolls_in_stock' => $this->whenHas('rolls_in_stock', fn () => (int) $this->rolls_in_stock),
            'balance_cm' => $this->whenHas('balance_cm', fn () => (int) $this->balance_cm),
        ];
    }
}
