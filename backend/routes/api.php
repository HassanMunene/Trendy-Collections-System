<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FabricController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\RollAdjustmentController;
use App\Http\Controllers\Api\RollController;
use App\Http\Controllers\Api\SessionController;
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
    });
});
