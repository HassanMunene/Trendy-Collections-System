<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockItemMovementResource;
use App\Http\Resources\StockItemResource;
use App\Models\StockItem;
use App\Services\StockItemReceiver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StockItemController extends Controller
{
    /** Units staff can type in the receive form. Free text would make stock meaningless. */
    public const UNITS = ['pcs', 'm', 'kg', 'pack', 'box', 'set', 'roll'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'low' => ['nullable', 'boolean'],
            'status' => ['nullable', Rule::in(['active', 'all'])],
        ]);

        $items = StockItem::query()
            ->with('supplier')
            ->when(($filters['status'] ?? 'active') === 'active', fn ($q) => $q->where('active', true))
            ->when($filters['low'] ?? false, fn ($q) => $q->low())
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)
                    ->orWhere('sku', 'ilike', $like)
                    ->orWhere('location', 'ilike', $like)
                    ->orWhereHas('supplier', fn ($s) => $s->where('name', 'ilike', $like)));
            })
            ->orderBy('name');

        return StockItemResource::collection($items->paginate(50)->withQueryString());
    }

    public function show(StockItem $stockItem): JsonResponse
    {
        $stockItem->load(['supplier', 'receiver']);
        $movements = $stockItem->movements()->with('actor')->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'data' => (new StockItemResource($stockItem))->resolve(),
            'movements' => StockItemMovementResource::collection($movements)->resolve(),
        ]);
    }

    /** Receive a batch of non-roll stock: hangers, trims, lining and the like. */
    public function store(Request $request, StockItemReceiver $receiver): JsonResponse
    {
        Gate::authorize('receive-stock');

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'sku' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9-]+$/', Rule::unique('stock_items', 'sku')],
            'unit' => ['required', Rule::in(self::UNITS)],
            'quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
            'reorder_level' => ['nullable', 'integer', 'min:0', 'max:10000000'],
            'cost_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'location' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $item = collect($data)->except('quantity')->all();
        $item['sku'] = isset($item['sku']) ? strtoupper(trim((string) $item['sku'])) : null;
        $item['notes'] = trim((string) ($item['notes'] ?? ''));
        $item['location'] = trim((string) ($item['location'] ?? '')) ?: 'Main shop';

        $created = $receiver->receive($request->user(), $item, (int) $data['quantity']);

        return (new StockItemResource($created->load(['supplier', 'receiver'])))
            ->response()->setStatusCode(201);
    }
}
