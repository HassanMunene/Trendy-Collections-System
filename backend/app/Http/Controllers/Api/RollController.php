<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FabricRules;
use App\Http\Resources\MovementResource;
use App\Http\Resources\RollResource;
use App\Models\Roll;
use App\Services\RollReceiver;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RollController extends Controller
{
    private const FABRIC_RELATIONS = ['fabric.category', 'fabric.materialType', 'fabric.texture', 'fabric.colour'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'colour_id' => ['nullable', 'integer'],
            'material_type_id' => ['nullable', 'integer'],
            'fabric_id' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(['active', 'finished', 'written_off', 'all'])],
            'low' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['newest', 'balance_asc', 'balance_desc', 'tag'])],
        ]);

        $rolls = Roll::query()
            ->with([...self::FABRIC_RELATIONS, 'supplier'])
            ->when(($filters['status'] ?? 'active') !== 'all', fn ($q) => $q->where('rolls.status', $filters['status'] ?? 'active'))
            ->when($filters['fabric_id'] ?? null, fn ($q, $id) => $q->where('fabric_id', $id))
            ->when($filters['category_id'] ?? null, fn ($q, $id) => $q->whereHas('fabric', fn ($f) => $f->where('fabric_category_id', $id)))
            ->when($filters['colour_id'] ?? null, fn ($q, $id) => $q->whereHas('fabric', fn ($f) => $f->where('colour_id', $id)))
            ->when($filters['material_type_id'] ?? null, fn ($q, $id) => $q->whereHas('fabric', fn ($f) => $f->where('material_type_id', $id)))
            ->when($filters['low'] ?? false, fn ($q) => $q->low())
            ->when($filters['q'] ?? null, fn ($q, $term) => $this->search($q, $term));

        match ($filters['sort'] ?? 'newest') {
            'balance_asc' => $rolls->orderBy('balance_cm')->orderBy('id'),
            'balance_desc' => $rolls->orderByDesc('balance_cm')->orderBy('id'),
            'tag' => $rolls->orderBy('tag'),
            default => $rolls->orderByDesc('id'),
        };

        return RollResource::collection($rolls->paginate(30)->withQueryString());
    }

    public function show(Roll $roll): JsonResponse
    {
        $roll->load([...self::FABRIC_RELATIONS, 'supplier', 'receiver']);
        $movements = $roll->movements()->with('actor')->orderByDesc('id')->limit(200)->get();

        return response()->json([
            'data' => (new RollResource($roll))->resolve(),
            'movements' => MovementResource::collection($movements)->resolve(),
        ]);
    }

    /** Receive a roll (optionally creating its fabric and supplier in the same step). */
    public function store(Request $request, RollReceiver $receiver): JsonResponse
    {
        Gate::authorize('receive-stock');

        if (is_array($request->input('supplier'))) {
            $request->merge(['supplier' => array_merge($request->input('supplier'), [
                'phone' => Phone::normalize($request->input('supplier.phone')) ?? $request->input('supplier.phone'),
            ])]);
        }

        $data = $request->validate([
            'fabric_id' => ['required_without:fabric', 'prohibits:fabric', 'nullable', 'integer', Rule::exists('fabrics', 'id')->where('active', true)],
            'fabric' => ['required_without:fabric_id', 'nullable', 'array'],
            ...FabricRules::rules('fabric.'),
            'fabric.fabric_category_id' => ['required_with:fabric', 'integer', 'exists:fabric_categories,id'],
            'fabric.material_type_id' => ['required_with:fabric', 'integer', 'exists:material_types,id'],
            'fabric.texture_id' => ['required_with:fabric', 'integer', 'exists:textures,id'],
            'fabric.colour_id' => ['required_with:fabric', 'integer', 'exists:colours,id'],

            'supplier_id' => ['nullable', 'prohibits:supplier', 'integer', 'exists:suppliers,id'],
            'supplier' => ['nullable', 'array'],
            'supplier.name' => ['required_with:supplier', 'string', 'max:100'],
            'supplier.phone' => ['nullable', 'string', 'regex:/^254[17]\d{8}$/'],
            'supplier.building' => ['nullable', 'string', 'max:100'],
            'supplier.stall' => ['nullable', 'string', 'max:50'],

            'tag' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9-]+$/', Rule::unique('rolls', 'tag')],
            'stated_cm' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'received_cm' => ['required', 'integer', 'min:1', 'max:100000'],
            'cost_cents' => ['required', 'integer', 'min:0', 'max:10000000000'],
            'dye_lot' => ['nullable', 'string', 'max:50'],
            'invoice_ref' => ['nullable', 'string', 'max:50'],
            'purchase_date' => ['nullable', 'date', 'before_or_equal:today'],
            'location' => ['nullable', 'string', 'max:60'],
            'included_services' => ['nullable', 'string', 'max:200'],
            'remnant_alert_cm' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [
            'supplier.phone.regex' => 'Enter a Kenyan mobile number like 0712 345 678.',
            'fabric_id.required_without' => 'Choose a fabric or describe a new one.',
        ]);

        $newFabric = isset($data['fabric']) ? FabricRules::attributes($data['fabric']) : null;
        $newSupplier = $data['supplier'] ?? null;
        $roll = collect($data)->except(['fabric', 'supplier'])->all();
        foreach (['dye_lot', 'invoice_ref', 'included_services', 'notes'] as $text) {
            $roll[$text] = trim((string) ($roll[$text] ?? ''));
        }
        $roll['location'] = trim((string) ($roll['location'] ?? '')) ?: 'Main shop';

        $created = $receiver->receive($request->user(), $roll, $newFabric, $newSupplier);

        return (new RollResource($created->load([...self::FABRIC_RELATIONS, 'supplier', 'receiver'])))
            ->response()->setStatusCode(201);
    }

    private function search($query, string $term): void
    {
        $like = '%'.addcslashes($term, '%_\\').'%';
        $query->where(function ($q) use ($like) {
            $q->where('rolls.tag', 'ilike', $like)
                ->orWhere('rolls.dye_lot', 'ilike', $like)
                ->orWhere('rolls.location', 'ilike', $like)
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'ilike', $like))
                ->orWhereHas('fabric', function ($f) use ($like) {
                    $f->where('code', 'ilike', $like)
                        ->orWhere('design', 'ilike', $like)
                        ->orWhereHas('colour', fn ($c) => $c->where('name', 'ilike', $like))
                        ->orWhereHas('materialType', fn ($c) => $c->where('name', 'ilike', $like))
                        ->orWhereHas('texture', fn ($c) => $c->where('name', 'ilike', $like));
                });
        });
    }
}
