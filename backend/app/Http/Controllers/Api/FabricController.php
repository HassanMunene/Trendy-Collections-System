<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FabricRules;
use App\Http\Resources\FabricResource;
use App\Models\Fabric;
use App\Services\Audit;
use App\Services\RollReceiver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class FabricController extends Controller
{
    private const RELATIONS = ['category', 'materialType', 'texture', 'colour'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'include_inactive' => ['nullable', 'boolean'],
        ]);

        $fabrics = Fabric::query()
            ->with(self::RELATIONS)
            ->withCount(['rolls as rolls_in_stock' => fn ($q) => $q->where('status', 'active')])
            ->withSum(['rolls as balance_cm' => fn ($q) => $q->where('status', 'active')], 'balance_cm')
            ->when(! ($filters['include_inactive'] ?? false), fn ($q) => $q->where('active', true))
            ->when($filters['category_id'] ?? null, fn ($q, $id) => $q->where('fabric_category_id', $id))
            ->when($filters['q'] ?? null, fn ($q, $term) => $this->search($q, $term))
            ->orderBy('code')
            ->get();

        return FabricResource::collection($fabrics);
    }

    public function show(Fabric $fabric): FabricResource
    {
        return new FabricResource($fabric->load(self::RELATIONS));
    }

    public function store(Request $request, RollReceiver $receiver): JsonResponse
    {
        Gate::authorize('manage-catalogue');
        $data = FabricRules::attributes($request->validate(FabricRules::rules()));
        $data['code'] ??= $receiver->nextFabricCode();

        $fabric = Fabric::create($data + ['created_by' => $request->user()->id]);
        Audit::record($request->user(), 'fabric.created', $fabric, ['code' => $fabric->code]);

        return (new FabricResource($fabric->load(self::RELATIONS)))->response()->setStatusCode(201);
    }

    public function update(Request $request, Fabric $fabric): FabricResource
    {
        Gate::authorize('manage-catalogue');
        $rules = FabricRules::rules(existing: $fabric) + ['active' => ['sometimes', 'boolean']];
        $data = FabricRules::attributes($request->validate($rules));
        $data['code'] ??= $fabric->code;

        $before = $fabric->only(array_keys($data));
        $fabric->update($data);
        $changes = $fabric->getChanges();
        unset($changes['updated_at']);
        if ($changes !== []) {
            Audit::record($request->user(), 'fabric.updated', $fabric, [
                'before' => array_intersect_key($before, $changes),
                'after' => $changes,
            ]);
        }

        return new FabricResource($fabric->load(self::RELATIONS));
    }

    private function search($query, string $term): void
    {
        $like = '%'.addcslashes($term, '%_\\').'%';
        $query->where(function ($q) use ($like) {
            $q->where('code', 'ilike', $like)
                ->orWhere('design', 'ilike', $like)
                ->orWhere('shade_code', 'ilike', $like)
                ->orWhereHas('colour', fn ($c) => $c->where('name', 'ilike', $like))
                ->orWhereHas('materialType', fn ($c) => $c->where('name', 'ilike', $like))
                ->orWhereHas('texture', fn ($c) => $c->where('name', 'ilike', $like));
        });
    }
}
