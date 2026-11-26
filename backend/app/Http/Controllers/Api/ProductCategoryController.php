<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductCategoryResource;
use App\Models\CatalogueTerm;
use App\Models\ProductCategory;
use App\Services\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ProductCategoryController extends Controller
{
    public const UNITS = ['set', 'piece', 'pcs', 'pair', 'm', 'job'];

    public function index(): AnonymousResourceCollection
    {
        return ProductCategoryResource::collection(ProductCategory::active()->orderBy('sort_order')->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage-catalogue');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'unit' => ['required', Rule::in(self::UNITS)],
            'tracks_stock' => ['required', 'boolean'],
        ]);
        $name = CatalogueTerm::clean($data['name']);
        if (ProductCategory::where('name', $name)->exists()) {
            return response()->json(['message' => 'That kind of product already exists.', 'errors' => ['name' => ['That kind of product already exists.']]], 422);
        }

        $category = ProductCategory::create([
            'name' => $name,
            'unit' => $data['unit'],
            'tracks_stock' => $data['tracks_stock'],
            'sort_order' => ((int) ProductCategory::max('sort_order')) + 10,
        ]);
        Audit::record($request->user(), 'product_category.created', $category, ['name' => $category->name, 'unit' => $category->unit]);

        return (new ProductCategoryResource($category))->response()->setStatusCode(201);
    }
}
