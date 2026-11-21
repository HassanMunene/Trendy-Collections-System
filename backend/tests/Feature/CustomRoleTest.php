<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\ShopRole;
use App\Models\User;
use App\Support\Permission;
use App\Support\RolePermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CustomRoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_creates_a_custom_role_and_it_can_be_assigned(): void
    {
        $owner = $this->userWith(Role::Owner);

        $response = $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'Stock keeper',
            'description' => 'Counts and receives stock.',
            'permissions' => [Permission::RECEIVE_STOCK, Permission::VIEW_COSTS],
        ])->assertCreated()
            ->assertJsonPath('data.key', 'stock_keeper')
            ->assertJsonPath('data.label', 'Stock keeper')
            ->assertJsonPath('data.builtin', false)
            ->assertJsonPath('data.locked', false);

        $key = $response->json('data.key');
        $this->assertSame(1, ShopRole::where('key', $key)->count());
        $this->assertEqualsCanonicalizing([Permission::RECEIVE_STOCK, Permission::VIEW_COSTS], RolePermissions::forRole($key));

        $this->spa()->actingAs($owner)->getJson('/api/roles')
            ->assertOk()
            ->assertJsonFragment(['key' => 'stock_keeper', 'label' => 'Stock keeper']);

        $worker = $this->spa()->actingAs($owner)->postJson('/api/staff', [
            'name' => 'Halima Said',
            'username' => 'halima',
            'role' => $key,
            'password' => 'secret-123',
        ])->assertCreated()
            ->assertJsonPath('data.role', 'stock_keeper')
            ->assertJsonPath('data.role_label', 'Stock keeper')
            ->json('data');

        $this->spa()->actingAs($owner)->getJson('/api/me')->assertJsonPath('data.role_label', 'Owner');

        $customRole = collect($this->spa()->actingAs($owner)->getJson('/api/role-permissions')->json('data.roles'))->firstWhere('key', $key);
        $this->assertSame(1, $customRole['members']);

        // The new role's permissions work straight away, and owner-only powers do not.
        $workerUser = User::findOrFail($worker['id']);
        $this->assertTrue(RolePermissions::allows($workerUser, Permission::RECEIVE_STOCK));
        $this->assertTrue(RolePermissions::allows($workerUser, Permission::VIEW_COSTS));
        $this->assertFalse(RolePermissions::allows($workerUser, Permission::MANAGE_STAFF));
        $this->assertFalse(RolePermissions::allows($workerUser, Permission::ADJUST_STOCK));
    }

    public function test_custom_role_permissions_can_be_edited_like_a_built_in_role(): void
    {
        $owner = $this->userWith(Role::Owner);
        $key = $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'Stock keeper',
            'permissions' => [Permission::RECEIVE_STOCK],
        ])->assertCreated()->json('data.key');

        $this->spa()->actingAs($owner)->putJson("/api/role-permissions/{$key}", [
            'permissions' => [Permission::ADJUST_STOCK],
        ])->assertOk()
            ->assertJsonPath('data.key', 'stock_keeper')
            ->assertJsonPath('data.permissions', [Permission::ADJUST_STOCK]);

        $this->assertEqualsCanonicalizing([Permission::ADJUST_STOCK], RolePermissions::forRole($key));
        $this->assertSame(1, AuditEvent::where('action', 'role.permissions_updated')->count());
    }

    public function test_custom_role_can_be_renamed_but_keeps_its_key(): void
    {
        $owner = $this->userWith(Role::Owner);
        $key = $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'Stock keeper',
            'permissions' => [],
        ])->assertCreated()->json('data.key');

        $this->spa()->actingAs($owner)->patchJson("/api/roles/{$key}", [
            'label' => 'Store keeper',
            'description' => 'Receives deliveries.',
        ])->assertOk()
            ->assertJsonPath('data.key', $key)
            ->assertJsonPath('data.label', 'Store keeper')
            ->assertJsonPath('data.description', 'Receives deliveries.');

        $this->assertSame('Store keeper', ShopRole::find($key)->label);
    }

    public function test_a_role_in_use_cannot_be_deleted_until_people_are_moved(): void
    {
        $owner = $this->userWith(Role::Owner);
        $key = $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'Stock keeper',
            'permissions' => [Permission::RECEIVE_STOCK],
        ])->assertCreated()->json('data.key');

        $worker = $this->userWith(Role::Cashier);
        $this->spa()->actingAs($owner)->patchJson("/api/staff/{$worker->id}", [
            'name' => $worker->name, 'username' => $worker->username, 'role' => $key,
        ])->assertOk();

        $this->spa()->actingAs($owner)->deleteJson("/api/roles/{$key}")
            ->assertStatus(422)->assertJsonValidationErrors('role');

        $this->spa()->actingAs($owner)->patchJson("/api/staff/{$worker->id}", [
            'name' => $worker->name, 'username' => $worker->username, 'role' => Role::Cashier->value,
        ])->assertOk();

        $this->spa()->actingAs($owner)->deleteJson("/api/roles/{$key}")->assertOk();

        $this->assertNull(ShopRole::find($key));
        $this->assertSame(0, DB::table('role_permissions')->where('role', $key)->count());
        $this->assertSame(1, DB::table('audit_events')->where('action', 'role.deleted')->count());
    }

    public function test_built_in_roles_and_owner_only_permissions_are_protected(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->patchJson('/api/roles/manager', ['label' => 'Boss'])
            ->assertStatus(422)->assertJsonValidationErrors('role');
        $this->spa()->actingAs($owner)->deleteJson('/api/roles/cashier')
            ->assertStatus(422)->assertJsonValidationErrors('role');

        $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'Sneaky',
            'permissions' => [Permission::MANAGE_STAFF],
        ])->assertStatus(422)->assertJsonValidationErrors('permissions.0');

        $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'stock keeper ',
            'permissions' => [],
        ])->assertCreated();
        $this->spa()->actingAs($owner)->postJson('/api/roles', [
            'label' => 'STOCK KEEPER',
            'permissions' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('label');
    }

    public function test_only_owners_can_manage_roles(): void
    {
        $manager = $this->userWith(Role::Manager);

        $this->spa()->actingAs($manager)->getJson('/api/roles')->assertForbidden();
        $this->spa()->actingAs($manager)->postJson('/api/roles', ['label' => 'Picker', 'permissions' => []])->assertForbidden();
        $this->spa()->actingAs($manager)->patchJson('/api/roles/manager', ['label' => 'Boss'])->assertForbidden();
        $this->spa()->actingAs($manager)->deleteJson('/api/roles/cashier')->assertForbidden();
    }
}
