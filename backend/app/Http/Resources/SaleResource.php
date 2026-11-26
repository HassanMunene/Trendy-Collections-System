<?php

namespace App\Http\Resources;

use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleLine;
use App\Models\SaleReturn;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Sale */
class SaleResource extends JsonResource
{
    /** Everything a sale screen shows. */
    public const RELATIONS = ['customer', 'seller', 'voider', 'lines', 'payments', 'returns.lines', 'returns.creator', 'approval'];

    public function toArray(Request $request): array
    {
        $returned = $this->relationLoaded('returns')
            ? $this->returns->flatMap->lines->groupBy('sale_line_id')->map->sum('quantity')
            : collect();

        return [
            'id' => $this->id,
            'number' => $this->number,
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'stall' => $this->customer->stall,
            ] : null),
            'customer_name' => $this->customer_name,
            'approval' => $this->whenLoaded('approval', fn () => $this->approval ? ['id' => $this->approval->id, 'number' => $this->approval->number] : null),
            'total_cents' => $this->total_cents,
            'note' => $this->note,
            'status' => $this->status,
            'sold_by' => $this->whenLoaded('seller', fn () => ['id' => $this->seller->id, 'name' => $this->seller->name]),
            'voided_by' => $this->whenLoaded('voider', fn () => $this->voider ? ['id' => $this->voider->id, 'name' => $this->voider->name] : null),
            'voided_at' => $this->voided_at?->toIso8601String(),
            'void_reason' => $this->void_reason,
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn (SaleLine $line) => [
                'id' => $line->id,
                'kind' => $line->kind,
                'stock_item_id' => $line->stock_item_id,
                'roll_id' => $line->roll_id,
                'description' => $line->description,
                'quantity' => $line->quantity,
                'length_cm' => $line->length_cm,
                'unit' => $line->unit,
                'asking_unit_cents' => $line->asking_unit_cents,
                'asking_total_cents' => $line->askingTotalCents(),
                'total_cents' => $line->total_cents,
                'returned_quantity' => (int) ($returned[$line->id] ?? 0),
            ])->all()),
            'returns' => $this->whenLoaded('returns', fn () => $this->returns->map(fn (SaleReturn $r) => [
                'id' => $r->id,
                'number' => $r->number,
                'refund_method' => $r->refund_method,
                'refund_label' => SaleReturn::REFUND_METHODS[$r->refund_method],
                'refund_cents' => $r->refund_cents,
                'reason' => $r->reason,
                'lines' => $r->lines->map(fn ($l) => ['sale_line_id' => $l->sale_line_id, 'quantity' => $l->quantity])->all(),
                'created_by' => $r->relationLoaded('creator') ? ['id' => $r->creator->id, 'name' => $r->creator->name] : null,
                'created_at' => $r->created_at?->toIso8601String(),
            ])->all()),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn (Payment $payment) => [
                'id' => $payment->id,
                'method' => $payment->method,
                'method_label' => Payment::METHODS[$payment->method],
                'amount_cents' => $payment->amount_cents,
                'mpesa_code' => $payment->mpesa_code,
                'voided' => $payment->voided_at !== null,
            ])->all()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
