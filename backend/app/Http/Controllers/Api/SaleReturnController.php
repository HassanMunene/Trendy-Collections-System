<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Services\ReturnRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class SaleReturnController extends Controller
{
    public function store(Request $request, Sale $sale, ReturnRecorder $recorder): JsonResponse
    {
        Gate::authorize('take-returns');
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.sale_line_id' => ['required', 'integer', 'distinct'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'refund_method' => ['required', Rule::in(array_keys(SaleReturn::REFUND_METHODS))],
            'refund_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'reason' => ['required', 'string', 'max:500'],
        ], ['lines.required' => 'Choose what came back.']);

        $recorder->record(
            $request->user(),
            $sale,
            array_map(fn (array $l) => ['sale_line_id' => (int) $l['sale_line_id'], 'quantity' => (int) $l['quantity']], $data['lines']),
            $data['refund_method'],
            (int) $data['refund_cents'],
            $data['reason'],
        );

        return (new SaleResource($sale->refresh()->load(SaleResource::RELATIONS)))->response()->setStatusCode(201);
    }
}
