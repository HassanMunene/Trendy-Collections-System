<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SewingBatchInput extends Model
{
    public $timestamps = false;

    protected $fillable = ['sewing_batch_id', 'roll_id', 'used_cm'];

    protected function casts(): array
    {
        return ['used_cm' => 'integer'];
    }

    /** @return BelongsTo<Roll, $this> */
    public function roll(): BelongsTo
    {
        return $this->belongsTo(Roll::class);
    }
}
