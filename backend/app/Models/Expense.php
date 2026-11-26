<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Money the shop paid out: transport, tailor pay, lunch... Never edited; voided with a reason. */
class Expense extends Model
{
    public const UPDATED_AT = null;

    public const CATEGORIES = [
        'transport' => 'Transport',
        'tailor_pay' => 'Tailor pay',
        'food' => 'Food',
        'materials' => 'Materials & thread',
        'rent' => 'Rent',
        'airtime' => 'Airtime & data',
        'other' => 'Other',
    ];

    public const METHODS = ['cash' => 'Cash', 'send_money' => 'Send money', 'paybill' => 'Paybill'];

    protected $fillable = [
        'category', 'amount_cents', 'method', 'paid_to', 'description', 'recorded_by',
        'voided_at', 'voided_by', 'void_reason',
    ];

    protected $attributes = ['paid_to' => '', 'description' => '', 'void_reason' => ''];

    protected function casts(): array
    {
        return ['amount_cents' => 'integer', 'voided_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /** @return BelongsTo<User, $this> */
    public function voider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }
}
