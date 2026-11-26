<?php

namespace App\Support;

use App\Models\Customer;
use Illuminate\Support\Facades\DB;

/**
 * What a customer owes the shop:
 *   goods taken on "to pay" (posted sales and collected custom orders)
 *   − payments made towards their account
 *   − returns credited to their account.
 * Voided sales and payments never count.
 */
final class CustomerBalance
{
    /** SQL for the balance of the customer in the outer query's `customers` row. */
    public static function owedSql(string $customerColumn = 'customers.id'): string
    {
        return <<<SQL
            (
              COALESCE((SELECT SUM(p.amount_cents) FROM payments p JOIN sales s ON s.id = p.sale_id
                        WHERE s.customer_id = {$customerColumn} AND s.status = 'posted'
                          AND p.method = 'account' AND p.voided_at IS NULL), 0)
              + COALESCE((SELECT SUM(p.amount_cents) FROM payments p JOIN orders o ON o.id = p.order_id
                          WHERE o.customer_id = {$customerColumn} AND p.method = 'account' AND p.voided_at IS NULL), 0)
              - COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                          WHERE p.sale_id IS NULL AND p.order_id IS NULL AND p.customer_id = {$customerColumn} AND p.voided_at IS NULL), 0)
              - COALESCE((SELECT SUM(r.refund_cents) FROM sale_returns r JOIN sales s ON s.id = r.sale_id
                          WHERE s.customer_id = {$customerColumn} AND s.status = 'posted' AND r.refund_method = 'account'), 0)
            )
            SQL;
    }

    public static function owed(Customer|int $customer): int
    {
        $id = $customer instanceof Customer ? $customer->id : $customer;

        return (int) DB::selectOne('SELECT '.self::owedSql('?').' AS owed', [$id, $id, $id, $id])->owed;
    }
}
