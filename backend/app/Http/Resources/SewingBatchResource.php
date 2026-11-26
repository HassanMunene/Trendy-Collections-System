<?php

namespace App\Http\Resources;

use App\Models\SewingBatch;
use App\Models\SewingBatchInput;
use App\Models\SewingBatchOutput;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SewingBatch */
class SewingBatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sewn_by' => $this->whenLoaded('tailor', fn () => ['id' => $this->tailor->id, 'name' => $this->tailor->name]),
            'recorded_by' => $this->whenLoaded('recorder', fn () => ['id' => $this->recorder->id, 'name' => $this->recorder->name]),
            'note' => $this->note,
            'inputs' => $this->whenLoaded('inputs', fn () => $this->inputs->map(fn (SewingBatchInput $input) => [
                'roll_id' => $input->roll_id,
                'roll_tag' => $input->roll->tag,
                'fabric' => $input->roll->fabric->displayName(),
                'used_cm' => $input->used_cm,
            ])->all()),
            'outputs' => $this->whenLoaded('outputs', fn () => $this->outputs->map(fn (SewingBatchOutput $output) => [
                'stock_item_id' => $output->stock_item_id,
                'name' => $output->stockItem->name,
                'unit' => $output->stockItem->unit,
                'quantity' => $output->quantity,
            ])->all()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
