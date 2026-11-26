<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SewingBatchResource;
use App\Models\SewingBatch;
use App\Models\User;
use App\Services\SewingRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SewingBatchController extends Controller
{
    private const RELATIONS = ['tailor', 'recorder', 'inputs.roll.fabric.colour', 'inputs.roll.fabric.texture', 'inputs.roll.fabric.materialType', 'outputs.stockItem'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'sewn_by' => ['nullable', 'integer'],
            'from' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $user = $request->user();
        // Tailors see their own work; whoever can manage stock sees everyone's.
        $seeAll = Gate::allows('receive-stock') || Gate::allows('adjust-stock');

        $batches = SewingBatch::with(self::RELATIONS)
            ->when(! $seeAll, fn ($q) => $q->where('sewn_by', $user->id))
            ->when($seeAll && ($filters['sewn_by'] ?? null), fn ($q) => $q->where('sewn_by', $filters['sewn_by']))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', Carbon::createFromFormat('Y-m-d', $from, DayBookController::TIMEZONE)->startOfDay()->utc()))
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return SewingBatchResource::collection($batches);
    }

    /** People who may be credited with sewing, for the "sewn by" picker. */
    public function tailors(): JsonResponse
    {
        Gate::authorize('adjust-stock');
        $people = User::where('active', true)->orderBy('name')->get(['id', 'name', 'role'])
            ->filter(fn (User $u) => Gate::forUser($u)->allows('record-sewing'))
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])
            ->values();

        return response()->json(['data' => $people]);
    }

    public function store(Request $request, SewingRecorder $recorder): JsonResponse
    {
        Gate::authorize('record-sewing');
        $data = $request->validate([
            'sewn_by' => ['nullable', 'integer', Rule::exists('users', 'id')->where('active', true)],
            'note' => ['nullable', 'string', 'max:500'],
            'inputs' => ['present', 'array', 'max:10'],
            'inputs.*.roll_id' => ['required', 'integer', 'distinct', 'exists:rolls,id'],
            'inputs.*.used_cm' => ['required', 'integer', 'min:1', 'max:100000'],
            'outputs' => ['required', 'array', 'min:1', 'max:20'],
            'outputs.*.stock_item_id' => ['required', 'integer', 'distinct', 'exists:stock_items,id'],
            'outputs.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
        ], ['outputs.required' => 'Add what was sewn.']);

        $actor = $request->user();
        $tailor = isset($data['sewn_by']) ? User::findOrFail($data['sewn_by']) : $actor;
        // Credit belongs to the person who did the work; only a stock manager may record for someone else.
        if ($tailor->id !== $actor->id && ! Gate::allows('adjust-stock')) {
            throw ValidationException::withMessages(['sewn_by' => 'You can only record your own sewing.']);
        }

        $batch = $recorder->record(
            $actor,
            $tailor,
            array_map(fn (array $i) => ['roll_id' => (int) $i['roll_id'], 'used_cm' => (int) $i['used_cm']], $data['inputs']),
            array_map(fn (array $o) => ['stock_item_id' => (int) $o['stock_item_id'], 'quantity' => (int) $o['quantity']], $data['outputs']),
            (string) ($data['note'] ?? ''),
        );

        return (new SewingBatchResource($batch->load(self::RELATIONS)))->response()->setStatusCode(201);
    }
}
