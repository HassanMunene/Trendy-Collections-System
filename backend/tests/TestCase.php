<?php

namespace Tests;

use App\Enums\Role;
use App\Models\Colour;
use App\Models\FabricCategory;
use App\Models\MaterialType;
use App\Models\Roll;
use App\Models\Texture;
use App\Models\User;
use App\Support\RoleCatalog;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Role labels are memoised per request; tests rebuild the database between cases.
        RoleCatalog::flush();
    }

    /** Pretend requests come from the React app so Sanctum gives them a session. */
    protected function spa(): static
    {
        return $this->withHeaders(['Origin' => 'http://localhost:5180', 'Accept' => 'application/json']);
    }

    protected function userWith(Role $role, array $attributes = []): User
    {
        return User::factory()->role($role)->create($attributes);
    }

    /** A valid "receive a roll with a brand-new fabric and supplier" payload. */
    protected function newRollPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'fabric' => [
                'fabric_category_id' => FabricCategory::firstOrCreate(['name' => 'Curtain fabric'])->id,
                'material_type_id' => MaterialType::firstOrCreate(['name' => 'Linen'])->id,
                'texture_id' => Texture::firstOrCreate(['name' => 'Woven'])->id,
                'colour_id' => Colour::firstOrCreate(['name' => 'Cream'])->id,
                'design' => 'Damask',
                'width_cm' => 280,
                'retail_price_cents_per_m' => 85000,
            ],
            'supplier' => ['name' => 'Mama Njeri Textiles', 'phone' => '0712 345 678', 'building' => 'Garissa Lodge', 'stall' => 'B12'],
            'stated_cm' => 5000,
            'received_cm' => 5000,
            'cost_cents' => 2000000,
            'dye_lot' => 'L-77',
            'purchase_date' => now()->toDateString(),
        ], $overrides);
    }

    protected function receiveRoll(User $as, array $overrides = []): TestResponse
    {
        return $this->spa()->actingAs($as)->postJson('/api/rolls', $this->newRollPayload($overrides));
    }

    protected function receivedRoll(User $as, array $overrides = []): Roll
    {
        $id = $this->receiveRoll($as, $overrides)->assertCreated()->json('data.id');

        return Roll::findOrFail($id);
    }
}
