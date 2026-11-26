<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleReturnLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['sale_return_id', 'sale_line_id', 'quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }

    /** @return BelongsTo<SaleLine, $this> */
    public function saleLine(): BelongsTo
    {
        return $this->belongsTo(SaleLine::class);
    }
}
