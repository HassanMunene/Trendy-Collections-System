<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Services\ExpenseRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    public function store(Request $request, ExpenseRecorder $recorder): JsonResponse
    {
        Gate::authorize('record-expenses');
        $data = $request->validate([
            'category' => ['required', Rule::in(array_keys(Expense::CATEGORIES))],
            'amount_cents' => ['required', 'integer', 'min:1', 'max:10000000000'],
            'method' => ['required', Rule::in(array_keys(Expense::METHODS))],
            'paid_to' => ['nullable', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
        ], ['category.required' => 'Choose what the money was for.']);

        $expense = $recorder->record($request->user(), $data);

        return response()->json(['data' => self::present($expense->load('recorder'))], 201);
    }

    public function void(Request $request, Expense $expense, ExpenseRecorder $recorder): JsonResponse
    {
        Gate::authorize('void-sales');
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return response()->json(['data' => self::present($recorder->void($request->user(), $expense, $data['reason'])->load(['recorder', 'voider']))]);
    }

    /** @return array<string, mixed> */
    public static function present(Expense $e): array
    {
        return [
            'id' => $e->id,
            'category' => $e->category,
            'category_label' => Expense::CATEGORIES[$e->category],
            'amount_cents' => $e->amount_cents,
            'method' => $e->method,
            'method_label' => Expense::METHODS[$e->method],
            'paid_to' => $e->paid_to,
            'description' => $e->description,
            'recorded_by' => $e->relationLoaded('recorder') ? ['id' => $e->recorder->id, 'name' => $e->recorder->name] : null,
            'voided' => $e->voided_at !== null,
            'voided_by' => $e->relationLoaded('voider') && $e->voider ? ['id' => $e->voider->id, 'name' => $e->voider->name] : null,
            'void_reason' => $e->void_reason,
            'created_at' => $e->created_at?->toIso8601String(),
        ];
    }
}
