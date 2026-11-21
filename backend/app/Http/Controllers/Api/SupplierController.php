<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupplierResource;
use App\Models\CatalogueTerm;
use App\Models\Supplier;
use App\Services\Audit;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Suppliers are saved by hand here, or created in one step while receiving a roll. */
class SupplierController extends Controller
{
    public function index(): JsonResponse
    {
        Gate::authorize('view-costs');

        return response()->json([
            'data' => SupplierResource::collection(Supplier::where('active', true)->orderBy('name')->get()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage-catalogue');
        $data = $this->validated($request);
        $this->ensureNotDuplicate($data['name'], $data['building'], $data['stall']);

        $supplier = Supplier::create($data);
        Audit::record($request->user(), 'supplier.created', $supplier, ['name' => $supplier->name]);

        return (new SupplierResource($supplier))->response()->setStatusCode(201);
    }

    public function update(Request $request, Supplier $supplier): SupplierResource
    {
        Gate::authorize('manage-catalogue');
        $data = $this->validated($request);
        $this->ensureNotDuplicate($data['name'], $data['building'], $data['stall'], $supplier);

        $supplier->update($data);
        Audit::record($request->user(), 'supplier.updated', $supplier, ['name' => $supplier->name]);

        return new SupplierResource($supplier->fresh());
    }

    /** @return array{name: string, phone: string, building: string, stall: string, notes: string} */
    private function validated(Request $request): array
    {
        // Store one phone form (254712345678) whichever way it was typed.
        $request->merge(['phone' => Phone::normalize($request->input('phone')) ?? (string) $request->input('phone')]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'regex:/^254[17]\d{8}$/'],
            'building' => ['nullable', 'string', 'max:100'],
            'stall' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:500'],
        ], [
            'phone.required' => 'Enter the supplier\'s phone number so you can reach them.',
            'phone.regex' => 'Enter a Kenyan mobile number, for example 0712 345 678.',
        ]);

        return [
            'name' => CatalogueTerm::clean($data['name']),
            'phone' => $data['phone'],
            'building' => CatalogueTerm::clean($data['building'] ?? ''),
            'stall' => CatalogueTerm::clean($data['stall'] ?? ''),
            'notes' => trim((string) ($data['notes'] ?? '')),
        ];
    }

    private function ensureNotDuplicate(string $name, string $building, string $stall, ?Supplier $ignore = null): void
    {
        $existing = Supplier::query()
            ->where('name', $name)
            ->where('building', $building)
            ->where('stall', $stall)
            ->when($ignore, fn ($query) => $query->whereKeyNot($ignore->id))
            ->exists();

        if ($existing) {
            throw ValidationException::withMessages([
                'name' => 'This supplier is already saved. Search the list and edit it instead.',
            ]);
        }
    }
}
