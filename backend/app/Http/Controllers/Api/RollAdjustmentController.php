<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Roll;
use App\Services\StockAdjuster;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class RollAdjustmentController extends Controller
{
    public function index(Roll $roll): JsonResponse
    {
        $rows = $roll->adjustments()->with('actor')->orderByDesc('id')->get()->map(fn ($a) => [
            'id' => $a->id,
            'before_cm' => $a->before_cm,
            'after_cm' => $a->after_cm,
            'reason' => $a->reason,
            'actor' => ['id' => $a->actor->id, 'name' => $a->actor->name],
            'created_at' => $a->created_at?->toIso8601String(),
        ]);

        return response()->json(['data' => $rows]);
    }

    /** Record a physical count. Owner/manager only. */
    public function store(Request $request, Roll $roll, StockAdjuster $adjuster): JsonResponse
    {
        Gate::authorize('adjust-stock');
        $data = $request->validate([
            'counted_cm' => ['required', 'integer', 'min:0', 'max:100000'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $adjustment = $adjuster->adjust($roll->id, $data['counted_cm'], $data['reason'], $request->user());

        return response()->json(['data' => [
            'id' => $adjustment->id,
            'before_cm' => $adjustment->before_cm,
            'after_cm' => $adjustment->after_cm,
            'reason' => $adjustment->reason,
        ]], 201);
    }
}
