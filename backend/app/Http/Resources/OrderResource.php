<?php

namespace App\Http\Resources;

use App\Http\Controllers\Api\AccountPaymentController;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Order */
class OrderResource extends JsonResource
{
    public const RELATIONS = ['customer', 'creator', 'canceller', 'lines', 'payments.receiver', 'payments.voider'];

    public function toArray(Request $request): array
    {
        $paid = $this->relationLoaded('payments')
            ? (int) $this->payments->whereNull('voided_at')->sum('amount_cents')
            : $this->paidCents();

        return [
            'id' => $this->id,
            'number' => $this->number,
            'customer' => $this->whenLoaded('customer', fn () => [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'stall' => $this->customer->stall,
                'phone' => $this->customer->phone,
            ]),
            'status' => $this->status,
            'status_label' => Order::STATUSES[$this->status],
            'due_on' => $this->due_on->toDateString(),
            'overdue' => $this->isOverdue(),
            'total_cents' => $this->total_cents,
            'paid_cents' => $paid,
            'balance_cents' => $this->status === 'cancelled' ? 0 : $this->total_cents - $paid,
            'note' => $this->note,
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn (OrderLine $l) => [
                'id' => $l->id,
                'kind' => $l->kind,
                'roll_id' => $l->roll_id,
                'length_cm' => $l->length_cm,
                'stock_item_id' => $l->stock_item_id,
                'quantity' => $l->quantity,
                'description' => $l->description,
                'total_cents' => $l->total_cents,
            ])->all()),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn (Payment $p) => AccountPaymentController::present($p))->all()),
            'created_by' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'ready_at' => $this->ready_at?->toIso8601String(),
            'collected_at' => $this->collected_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancelled_by' => $this->whenLoaded('canceller', fn () => $this->canceller ? ['id' => $this->canceller->id, 'name' => $this->canceller->name] : null),
            'cancel_reason' => $this->cancel_reason,
            'refund_method' => $this->refund_method,
            'refund_cents' => $this->refund_cents,
        ];
    }
}
