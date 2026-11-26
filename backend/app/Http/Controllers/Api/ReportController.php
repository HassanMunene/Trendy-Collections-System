<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DayLedger;
use App\Services\SalesReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** How the shop did between two dates. Defaults to this month so far. */
class ReportController extends Controller
{
    /** Longest range one report covers. */
    public const MAX_DAYS = 366;

    public function __invoke(Request $request, SalesReport $report): JsonResponse
    {
        Gate::authorize('view-reports');
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $today = now(DayLedger::TIMEZONE)->startOfDay();
        $to = isset($data['to']) ? Carbon::createFromFormat('Y-m-d', $data['to'], DayLedger::TIMEZONE)->startOfDay() : $today;
        $from = isset($data['from']) ? Carbon::createFromFormat('Y-m-d', $data['from'], DayLedger::TIMEZONE)->startOfDay() : $to->copy()->startOfMonth();

        if ($from->gt($to)) {
            throw ValidationException::withMessages(['from' => 'The start date must be on or before the end date.']);
        }
        if ($from->diffInDays($to) + 1 > self::MAX_DAYS) {
            throw ValidationException::withMessages(['from' => 'Pick a range of at most a year.']);
        }

        return response()->json(['data' => $report->build($from, $to, Gate::allows('view-costs'))]);
    }
}
