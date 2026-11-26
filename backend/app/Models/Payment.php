<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Money taken for a sale, for a custom order (deposit or balance), or paid towards a customer's
 * account (no sale or order, customer_id set).
 * "account" on a sale means the customer took the goods and owes the amount (the book's "To pay").
 * Payments are never edited; a sale's payments are voided with it, an account payment on its own.
 */
class Payment extends Model
{
    public const UPDATED_AT = null;

    /** Methods and the words staff see. Numbers confirmed by Mum on 22 Nov 2026. */
    public const METHODS = [
        'cash' => 'Cash',
        'send_money' => 'Send money',
        'paybill' => 'Paybill',
        'account' => 'To pay',
    ];

    public const MPESA_METHODS = ['send_money', 'paybill'];

    protected $fillable = [
        'sale_id', 'order_id', 'customer_id', 'method', 'amount_cents', 'mpesa_code', 'note',
        'received_by', 'voided_at', 'voided_by', 'void_reason',
    ];

    protected $attributes = ['note' => '', 'void_reason' => ''];

    protected function casts(): array
    {
        return ['amount_cents' => 'integer', 'voided_at' => 'datetime'];
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function voider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }

    /** @return BelongsTo<User, $this> */
    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
