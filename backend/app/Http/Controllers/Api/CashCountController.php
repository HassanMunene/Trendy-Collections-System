<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashCount;
use App\Services\DayLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;

/** Counting the drawer at closing. */
class CashCountController extends Controller
{
    public function store(Request $request, DayLedger $ledger): JsonResponse
    {
        Gate::authorize('close-day');
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'counted_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'kept_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $count = $ledger->close(
            $request->user(),
            Carbon::createFromFormat('Y-m-d', $data['date'], DayLedger::TIMEZONE)->startOfDay(),
            (int) $data['counted_cents'],
            (int) $data['kept_cents'],
            (string) ($data['note'] ?? ''),
        );

        return response()->json(['data' => self::present($count->load('counter'))], 201);
    }

    /** @return array<string, mixed> */
    public static function present(CashCount $c): array
    {
        return [
            'id' => $c->id,
            'date' => $c->business_date->toDateString(),
            'expected_cents' => $c->expected_cents,
            'counted_cents' => $c->counted_cents,
            'difference_cents' => $c->counted_cents - $c->expected_cents,
            'kept_cents' => $c->kept_cents,
            'note' => $c->note,
            'counted_by' => $c->relationLoaded('counter') ? ['id' => $c->counter->id, 'name' => $c->counter->name] : null,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }
}
