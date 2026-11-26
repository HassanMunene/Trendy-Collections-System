<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['approval_id', 'stock_item_id', 'quantity_out', 'quantity_returned', 'quantity_sold', 'unit_price_cents'];

    protected $attributes = ['quantity_returned' => 0, 'quantity_sold' => 0];

    protected function casts(): array
    {
        return [
            'quantity_out' => 'integer',
            'quantity_returned' => 'integer',
            'quantity_sold' => 'integer',
            'unit_price_cents' => 'integer',
        ];
    }

    /** Still with the shop that took it. */
    public function outstanding(): int
    {
        return $this->quantity_out - $this->quantity_returned - $this->quantity_sold;
    }

    /** @return BelongsTo<StockItem, $this> */
    public function stockItem(): BelongsTo
    {
        return $this->belongsTo(StockItem::class);
    }
}
