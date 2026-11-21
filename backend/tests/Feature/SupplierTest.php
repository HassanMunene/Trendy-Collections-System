<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_adds_a_supplier_with_name_and_phone(): void
    {
        $owner = $this->userWith(Role::Owner);

        $response = $this->spa()->actingAs($owner)->postJson('/api/suppliers', [
            'name' => '  Mama Njeri Textiles ',
            'phone' => '0712 345 678',
            'building' => 'Garissa Lodge',
            'stall' => 'B12',
            'notes' => 'Delivers on Tuesdays.',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Mama Njeri Textiles')
            ->assertJsonPath('data.phone', '254712345678')
            ->assertJsonPath('data.building', 'Garissa Lodge')
            ->assertJsonPath('data.stall', 'B12');

        $this->assertSame(1, Supplier::count());
        $this->assertSame(1, AuditEvent::where('action', 'supplier.created')->count());

        $this->spa()->actingAs($owner)->getJson('/api/suppliers')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.phone', '254712345678');
    }

    public function test_name_and_phone_are_mandatory(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->postJson('/api/suppliers', ['name' => 'Nairobi Fabrics'])
            ->assertStatus(422)->assertJsonValidationErrors('phone');

        $this->spa()->actingAs($owner)->postJson('/api/suppliers', ['phone' => '0712 345 678'])
            ->assertStatus(422)->assertJsonValidationErrors('name');

        $this->spa()->actingAs($owner)->postJson('/api/suppliers', ['name' => 'Nairobi Fabrics', 'phone' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors('phone');

        $this->assertSame(0, Supplier::count());
    }

    public function test_duplicate_supplier_is_rejected_whatever_the_capitalisation(): void
    {
        $owner = $this->userWith(Role::Owner);
        Supplier::create(['name' => 'Mama Njeri Textiles', 'phone' => '254712345678', 'building' => 'Garissa Lodge', 'stall' => 'B12']);

        $this->spa()->actingAs($owner)->postJson('/api/suppliers', [
            'name' => 'mama njeri textiles',
            'phone' => '0722 000 111',
            'building' => 'Garissa Lodge',
            'stall' => 'B12',
        ])->assertStatus(422)->assertJsonValidationErrors('name');

        // The same name in a different building is a different stall, so it is allowed.
        $this->spa()->actingAs($owner)->postJson('/api/suppliers', [
            'name' => 'Mama Njeri Textiles',
            'phone' => '0722 000 111',
            'building' => 'Textile House',
        ])->assertCreated();

        $this->assertSame(2, Supplier::count());
    }

    public function test_manager_edits_a_supplier(): void
    {
        $manager = $this->userWith(Role::Manager);
        $supplier = Supplier::create(['name' => 'Old Shop', 'phone' => '254700000000', 'building' => '', 'stall' => '']);

        $this->spa()->actingAs($manager)->patchJson("/api/suppliers/{$supplier->id}", [
            'name' => 'New Shop',
            'phone' => '+254 733 123 456',
            'building' => 'Garissa Lodge',
            'stall' => '',
            'notes' => 'Changed owners.',
        ])->assertOk()
            ->assertJsonPath('data.name', 'New Shop')
            ->assertJsonPath('data.phone', '254733123456')
            ->assertJsonPath('data.notes', 'Changed owners.');

        // Saving the same supplier again must not flag itself as a duplicate.
        $this->spa()->actingAs($manager)->patchJson("/api/suppliers/{$supplier->id}", [
            'name' => 'New Shop',
            'phone' => '254733123456',
            'building' => 'Garissa Lodge',
        ])->assertOk();

        $this->assertSame(2, AuditEvent::where('action', 'supplier.updated')->count());
    }

    public function test_cashier_cannot_see_or_add_suppliers(): void
    {
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($cashier)->getJson('/api/suppliers')->assertForbidden();
        $this->spa()->actingAs($cashier)->postJson('/api/suppliers', [
            'name' => 'Mama Njeri Textiles', 'phone' => '0712 345 678',
        ])->assertForbidden();
    }
}
