<?php

namespace App\Http\Resources;

use App\Models\Approval;
use App\Models\ApprovalLine;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Approval */
class ApprovalResource extends JsonResource
{
    public const RELATIONS = ['customer', 'creator', 'lines.stockItem', 'sales'];

    public function toArray(Request $request): array
    {
        $lines = $this->relationLoaded('lines') ? $this->lines : collect();

        return [
            'id' => $this->id,
            'number' => $this->number,
            'customer' => $this->whenLoaded('customer', fn () => ['id' => $this->customer->id, 'name' => $this->customer->name, 'stall' => $this->customer->stall]),
            'status' => $this->status,
            'due_on' => $this->due_on->toDateString(),
            'overdue' => $this->isOverdue(),
            'note' => $this->note,
            'pieces_out' => $lines->sum(fn (ApprovalLine $l) => $l->outstanding()),
            'value_out_cents' => $lines->sum(fn (ApprovalLine $l) => $l->outstanding() * ($l->unit_price_cents ?? 0)),
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn (ApprovalLine $l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'name' => $l->stockItem->name,
                'unit' => $l->stockItem->unit,
                'quantity_out' => $l->quantity_out,
                'quantity_returned' => $l->quantity_returned,
                'quantity_sold' => $l->quantity_sold,
                'outstanding' => $l->outstanding(),
                'unit_price_cents' => $l->unit_price_cents,
            ])->all()),
            'sales' => $this->whenLoaded('sales', fn () => $this->sales->map(fn ($s) => ['id' => $s->id, 'number' => $s->number, 'total_cents' => $s->total_cents, 'status' => $s->status])->all()),
            'created_by' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
        ];
    }
}
