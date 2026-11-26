<?php

use App\Http\Controllers\Api\AccountPaymentController;
use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashCountController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DayBookController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\FabricController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\RollAdjustmentController;
use App\Http\Controllers\Api\RollController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SaleReturnController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\SewingBatchController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\StockItemController;
use App\Http\Controllers\Api\SupplierController;
use Illuminate\Support\Facades\Route;

// All routes are prefixed with /api. The React app first calls GET /sanctum/csrf-cookie.

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/session/permissions', [SessionController::class, 'permissions']);
    Route::post('/me/password', [AuthController::class, 'changePassword']);
    Route::patch('/me', [ProfileController::class, 'update']);
    Route::post('/me/avatar', [ProfileController::class, 'updateAvatar']);
    Route::delete('/me/avatar', [ProfileController::class, 'destroyAvatar']);

    // Everything below is blocked until a temporary password has been changed.
    Route::middleware('password.changed')->group(function () {
        Route::get('/dashboard', DashboardController::class);

        Route::get('/staff', [StaffController::class, 'index']);
        Route::post('/staff', [StaffController::class, 'store']);
        Route::patch('/staff/{staff}', [StaffController::class, 'update']);
        Route::post('/staff/{staff}/reset-password', [StaffController::class, 'resetPassword']);
        Route::post('/staff/{staff}/active', [StaffController::class, 'setActive']);

        Route::get('/audit-events', AuditLogController::class);

        Route::get('/roles', [RoleController::class, 'index']);
        Route::post('/roles', [RoleController::class, 'store']);
        Route::patch('/roles/{role}', [RoleController::class, 'update']);
        Route::delete('/roles/{role}', [RoleController::class, 'destroy']);

        Route::get('/role-permissions', [RolePermissionController::class, 'index']);
        Route::put('/role-permissions/{role}', [RolePermissionController::class, 'update']);

        Route::get('/suppliers', [SupplierController::class, 'index']);
        Route::post('/suppliers', [SupplierController::class, 'store']);
        Route::patch('/suppliers/{supplier}', [SupplierController::class, 'update']);

        Route::get('/lookups', [LookupController::class, 'index']);
        Route::post('/lookups/{type}', [LookupController::class, 'store'])
            ->whereIn('type', ['categories', 'material_types', 'textures', 'colours']);

        Route::get('/fabrics', [FabricController::class, 'index']);
        Route::post('/fabrics', [FabricController::class, 'store']);
        Route::get('/fabrics/{fabric}', [FabricController::class, 'show']);
        Route::patch('/fabrics/{fabric}', [FabricController::class, 'update']);

        Route::get('/rolls', [RollController::class, 'index']);
        Route::post('/rolls', [RollController::class, 'store']);
        Route::get('/rolls/{roll}', [RollController::class, 'show']);
        Route::get('/rolls/{roll}/adjustments', [RollAdjustmentController::class, 'index']);
        Route::post('/rolls/{roll}/adjustments', [RollAdjustmentController::class, 'store']);

        // Stock that is not a fabric roll (hangers, trims, lining...).
        Route::get('/stock-items', [StockItemController::class, 'index']);
        Route::post('/stock-items', [StockItemController::class, 'store']);
        Route::get('/stock-items/{stockItem}', [StockItemController::class, 'show']);
        Route::post('/stock-items/{stockItem}/receipts', [StockItemController::class, 'receive']);
        Route::post('/stock-items/{stockItem}/adjustments', [StockItemController::class, 'adjust']);

        // What the shop sells (finished goods are stock items with a product category).
        Route::get('/product-categories', [ProductCategoryController::class, 'index']);
        Route::post('/product-categories', [ProductCategoryController::class, 'store']);
        Route::get('/products', [ProductController::class, 'index']);
        Route::post('/products', [ProductController::class, 'store']);
        Route::patch('/products/{product}', [ProductController::class, 'update']);

        // Counter sales: the sales book replacement.
        Route::get('/customers', [CustomerController::class, 'index']);
        Route::post('/customers', [CustomerController::class, 'store']);
        Route::get('/customers/{customer}', [CustomerController::class, 'show']);
        Route::patch('/customers/{customer}', [CustomerController::class, 'update']);
        Route::post('/sales', [SaleController::class, 'store']);
        Route::get('/sales/price-hint', [SaleController::class, 'priceHint']);
        Route::get('/sales/{sale}', [SaleController::class, 'show']);
        Route::post('/sales/{sale}/void', [SaleController::class, 'void']);
        Route::get('/day-book', DayBookController::class);
        Route::get('/reports', ReportController::class);

        // Trade accounts: paying off "to pay", returns, expenses, closing the day, goods on approval.
        Route::post('/customers/{customer}/payments', [AccountPaymentController::class, 'store']);
        Route::post('/account-payments/{payment}/void', [AccountPaymentController::class, 'void']);
        Route::post('/sales/{sale}/returns', [SaleReturnController::class, 'store']);
        Route::post('/expenses', [ExpenseController::class, 'store']);
        Route::post('/expenses/{expense}/void', [ExpenseController::class, 'void']);
        Route::post('/cash-counts', [CashCountController::class, 'store']);
        Route::get('/approvals', [ApprovalController::class, 'index']);
        Route::post('/approvals', [ApprovalController::class, 'store']);
        Route::get('/approvals/{approval}', [ApprovalController::class, 'show']);
        Route::post('/approvals/{approval}/settle', [ApprovalController::class, 'settle']);

        // Custom (made-to-measure) orders.
        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders', [OrderController::class, 'store']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
        Route::post('/orders/{order}/payments', [OrderController::class, 'pay']);
        Route::post('/orders/{order}/start', [OrderController::class, 'start']);
        Route::post('/orders/{order}/ready', [OrderController::class, 'ready']);
        Route::post('/orders/{order}/collect', [OrderController::class, 'collect']);
        Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel']);

        // Sewing for the shelf: roll metres in, finished goods out.
        Route::get('/sewing-batches', [SewingBatchController::class, 'index']);
        Route::get('/sewing-batches/tailors', [SewingBatchController::class, 'tailors']);
        Route::post('/sewing-batches', [SewingBatchController::class, 'store']);
    });
});
