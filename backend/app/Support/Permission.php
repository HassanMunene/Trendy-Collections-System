<?php

namespace App\Support;

/** The catalogue of things a signed-in account may do. Roles are built from these. */
final class Permission
{
    public const MANAGE_STAFF = 'manage_staff';

    public const VIEW_AUDIT = 'view_audit';

    public const MANAGE_CATALOGUE = 'manage_catalogue';

    public const RECEIVE_STOCK = 'receive_stock';

    public const ADJUST_STOCK = 'adjust_stock';

    public const VIEW_COSTS = 'view_costs';

    public const SELL = 'sell';

    public const VOID_SALES = 'void_sales';

    public const RECORD_SEWING = 'record_sewing';

    /**
     * Permissions an owner may hand to another role. Managing accounts and reading the
     * audit trail always stay with owners, so a manager cannot promote themselves.
     */
    public const ASSIGNABLE = [
        self::MANAGE_CATALOGUE,
        self::RECEIVE_STOCK,
        self::ADJUST_STOCK,
        self::VIEW_COSTS,
        self::SELL,
        self::VOID_SALES,
        self::RECORD_SEWING,
    ];

    public const OWNER_ONLY = [self::MANAGE_STAFF, self::VIEW_AUDIT];

    /** @var array<string, array{label: string, description: string, assignable: bool}> */
    public const DETAILS = [
        self::MANAGE_CATALOGUE => [
            'label' => 'Fabrics, suppliers & catalogue',
            'description' => 'Add and edit fabrics, catalogue options and suppliers.',
            'assignable' => true,
        ],
        self::RECEIVE_STOCK => [
            'label' => 'Receive stock',
            'description' => 'Receive new rolls and other stock into the shop.',
            'assignable' => true,
        ],
        self::ADJUST_STOCK => [
            'label' => 'Correct stock counts',
            'description' => 'Record a physical count that differs from the system.',
            'assignable' => true,
        ],
        self::VIEW_COSTS => [
            'label' => 'See costs & supplier details',
            'description' => 'View purchase costs, supplier names and contact numbers.',
            'assignable' => true,
        ],
        self::SELL => [
            'label' => 'Sell at the counter',
            'description' => 'Record sales and payments, add customers and read the day book.',
            'assignable' => true,
        ],
        self::VOID_SALES => [
            'label' => 'Void sales',
            'description' => 'Cancel a recorded sale with a reason. The stock goes back and the sale stays on record.',
            'assignable' => true,
        ],
        self::RECORD_SEWING => [
            'label' => 'Record sewing',
            'description' => 'Record fabric used and curtains, sheers and cases sewn into stock.',
            'assignable' => true,
        ],
        self::MANAGE_STAFF => [
            'label' => 'Manage users & roles',
            'description' => 'Create accounts, set roles, reset passwords, switch accounts off and change these permissions.',
            'assignable' => false,
        ],
        self::VIEW_AUDIT => [
            'label' => 'Read the audit log',
            'description' => 'See every change, sign-in and stock correction in the shop.',
            'assignable' => false,
        ],
    ];

    /** @return list<string> */
    public static function all(): array
    {
        return array_keys(self::DETAILS);
    }
}
