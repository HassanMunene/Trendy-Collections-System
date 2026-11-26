<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockItemResource;
use App\Models\Colour;
use App\Models\ProductCategory;
use App\Models\StockItem;
use App\Services\Audit;
use App\Services\StockItemReceiver;
use App\Support\ProductName;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Finished goods for sale: one row per category + colour + variant ("Window curtain – Grey").
 * Stored as stock items with a product category so they share the stock ledger.
 */
class ProductController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'include_inactive' => ['nullable', 'boolean'],
        ]);

        $products = StockItem::query()
            ->products()
            ->with(['category', 'colour', 'supplier'])
            ->join('product_categories', 'product_categories.id', '=', 'stock_items.product_category_id')
            ->select('stock_items.*')
            ->when(! ($filters['include_inactive'] ?? false), fn (Builder $q) => $q->where('stock_items.active', true))
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->where('stock_items.product_category_id', $id))
            ->when($filters['q'] ?? null, function (Builder $q, string $term) {
                foreach (preg_split('/\s+/', trim($term)) ?: [] as $word) {
                    $like = '%'.addcslashes($word, '%_\\').'%';
                    $q->where(fn (Builder $q) => $q->where('stock_items.name', 'ilike', $like)->orWhere('stock_items.sku', 'ilike', $like));
                }
            })
            ->orderBy('product_categories.sort_order')
            ->orderBy('stock_items.name')
            ->limit(500)
            ->get();

        return StockItemResource::collection($products);
    }

    public function store(Request $request, StockItemReceiver $receiver): JsonResponse
    {
        Gate::authorize('manage-catalogue');
        $data = $this->validated($request, null);
        $opening = (int) ($data['opening_quantity'] ?? 0);
        $category = ProductCategory::findOrFail($data['product_category_id']);

        if ($opening > 0) {
            Gate::authorize('receive-stock');
        }
        if (! $category->tracks_stock && $opening > 0) {
            throw ValidationException::withMessages(['opening_quantity' => "{$category->name} is a service and is not counted."]);
        }

        $fields = $this->fields($data, $category);
        $fields['received_by'] = $request->user()->id;

        $product = $opening > 0
            ? $receiver->receive($request->user(), $fields, $opening)
            : DB::transaction(function () use ($fields, $request) {
                $created = StockItem::create($fields);
                Audit::record($request->user(), 'product.created', $created, ['name' => $created->name, 'price_cents' => $created->price_cents]);

                return $created;
            });

        return (new StockItemResource($product->load(['category', 'colour', 'supplier'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, StockItem $product): StockItemResource
    {
        Gate::authorize('manage-catalogue');
        abort_unless($product->isProduct(), 404);
        $data = $this->validated($request, $product);
        $category = ProductCategory::findOrFail($data['product_category_id']);

        if ($category->tracks_stock !== $product->tracks_stock && $product->quantity > 0) {
            throw ValidationException::withMessages(['product_category_id' => 'Count this product down to zero before turning it into a service.']);
        }

        $before = $product->only(['name', 'price_cents', 'active']);
        $product->update($this->fields($data, $category) + ['active' => $data['active'] ?? $product->active]);
        Audit::record($request->user(), 'product.updated', $product, ['before' => $before, 'after' => $product->only(['name', 'price_cents', 'active'])]);

        return new StockItemResource($product->load(['category', 'colour', 'supplier']));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?StockItem $product): array
    {
        $data = $request->validate([
            'product_category_id' => ['required', 'integer', Rule::exists('product_categories', 'id')->where('active', true)],
            'colour_id' => ['nullable', 'integer', 'exists:colours,id'],
            'variant' => ['nullable', 'string', 'max:60'],
            'price_cents' => ['nullable', 'integer', 'min:0', 'max:10000000000'],
            'cost_cents' => ['nullable', 'integer', 'min:0', 'max:10000000000'],
            'reorder_level' => ['nullable', 'integer', 'min:0', 'max:10000000'],
            'sku' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9-]+$/', Rule::unique('stock_items', 'sku')->ignore($product?->id)],
            'location' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'active' => ['sometimes', 'boolean'],
            'opening_quantity' => ['nullable', 'integer', 'min:0', 'max:10000000'],
        ]);

        $duplicate = StockItem::query()
            ->products()
            ->where('product_category_id', $data['product_category_id'])
            ->when($data['colour_id'] ?? null, fn (Builder $q, $id) => $q->where('colour_id', $id), fn (Builder $q) => $q->whereNull('colour_id'))
            ->whereRaw('lower(variant) = lower(?)', [trim(preg_replace('/\s+/', ' ', (string) ($data['variant'] ?? '')) ?? '')])
            ->when($product, fn (Builder $q) => $q->whereKeyNot($product->id))
            ->first();
        if ($duplicate) {
            throw ValidationException::withMessages(['variant' => "{$duplicate->name} is already in the list."]);
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fields(array $data, ProductCategory $category): array
    {
        $colour = isset($data['colour_id']) ? Colour::find($data['colour_id']) : null;
        $variant = trim(preg_replace('/\s+/', ' ', (string) ($data['variant'] ?? '')) ?? '');
        $canSeeCosts = Gate::allows('view-costs');

        return array_filter([
            'product_category_id' => $category->id,
            'colour_id' => $colour?->id,
            'variant' => $variant,
            'name' => mb_substr(ProductName::make($category->name, $colour?->name, $variant), 0, 120),
            'unit' => $category->unit,
            'tracks_stock' => $category->tracks_stock,
            'price_cents' => $data['price_cents'] ?? null,
            'cost_cents' => $canSeeCosts ? ($data['cost_cents'] ?? 0) : null,
            'reorder_level' => $category->tracks_stock ? ($data['reorder_level'] ?? null) : null,
            'sku' => isset($data['sku']) && trim((string) $data['sku']) !== '' ? strtoupper(trim((string) $data['sku'])) : null,
            'location' => trim((string) ($data['location'] ?? '')) ?: 'Main shop',
            'notes' => trim((string) ($data['notes'] ?? '')),
        ], fn ($value, string $key) => $value !== null || in_array($key, ['colour_id', 'price_cents', 'reorder_level', 'sku'], true), ARRAY_FILTER_USE_BOTH);
    }
}
