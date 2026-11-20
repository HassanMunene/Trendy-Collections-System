<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupplierResource;
use App\Http\Resources\TermResource;
use App\Models\CatalogueTerm;
use App\Models\Colour;
use App\Models\FabricCategory;
use App\Models\MaterialType;
use App\Models\Roll;
use App\Models\Supplier;
use App\Models\Texture;
use App\Services\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class LookupController extends Controller
{
    /** @var array<string, class-string<CatalogueTerm>> */
    private const TYPES = [
        'categories' => FabricCategory::class,
        'material_types' => MaterialType::class,
        'textures' => Texture::class,
        'colours' => Colour::class,
    ];

    public function index(): JsonResponse
    {
        $data = [];
        foreach (self::TYPES as $key => $model) {
            $data[$key] = TermResource::collection($model::active()->orderBy('name')->get());
        }
        $data['suppliers'] = Gate::allows('view-costs')
            ? SupplierResource::collection(Supplier::where('active', true)->orderBy('name')->get())
            : [];
        $data['locations'] = Roll::query()->distinct()->orderBy('location')->pluck('location');

        return response()->json(['data' => $data]);
    }

    /** Add a colour, texture, etc. If it already exists (any capitalisation) return that one. */
    public function store(Request $request, string $type): JsonResponse
    {
        Gate::authorize('manage-catalogue');
        $model = self::TYPES[$type] ?? abort(404);
        $name = CatalogueTerm::clean((string) $request->validate(['name' => ['required', 'string', 'max:60']])['name']);

        $existing = $model::where('name', $name)->first();
        if ($existing) {
            if (! $existing->active) {
                $existing->update(['active' => true]);
            }

            return (new TermResource($existing))->response()->setStatusCode(200);
        }

        $term = $model::create(['name' => $name]);
        Audit::record($request->user(), 'catalogue.term_created', $term, ['name' => $term->name]);

        return (new TermResource($term))->response()->setStatusCode(201);
    }
}
