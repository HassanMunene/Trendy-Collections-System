<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_sees_the_permission_catalogue_and_every_role(): void
    {
        $owner = $this->userWith(Role::Owner);

        $response = $this->spa()->actingAs($owner)->getJson('/api/role-permissions')->assertOk();

        $response->assertJsonCount(6, 'data.permissions')
            ->assertJsonCount(5, 'data.roles')
            ->assertJsonPath('data.roles.0.key', 'owner')
            ->assertJsonPath('data.roles.0.locked', true)
            ->assertJsonPath('data.roles.1.key', 'manager')
            ->assertJsonPath('data.roles.1.locked', false);
    }

    public function test_defaults_match_the_permissions_the_shop_had_before(): void
    {
        $owner = $this->userWith(Role::Owner);

        $roles = collect($this->spa()->actingAs($owner)->getJson('/api/role-permissions')->json('data.roles'));
        $permissions = fn (string $role) => $roles->firstWhere('key', $role)['permissions'];

        $this->assertEqualsCanonicalizing(
            [Permission::MANAGE_CATALOGUE, Permission::RECEIVE_STOCK, Permission::ADJUST_STOCK, Permission::VIEW_COSTS],
            $permissions('manager'),
        );
        $this->assertSame([], $permissions('cashier'));
        $this->assertSame([], $permissions('cutter'));
        $this->assertSame([], $permissions('tailor'));
        $this->assertEqualsCanonicalizing(Permission::all(), $permissions('owner'));
    }

    public function test_owner_edits_a_role_and_it_applies_immediately(): void
    {
        $owner = $this->userWith(Role::Owner);
        $manager = $this->userWith(Role::Manager);

        $this->spa()->actingAs($manager)->getJson('/api/me')
            ->assertJsonPath('data.permissions.receive_stock', true);

        $this->spa()->actingAs($owner)->putJson('/api/role-permissions/manager', [
            'permissions' => [Permission::MANAGE_CATALOGUE],
        ])->assertOk()
            ->assertJsonPath('data.key', 'manager')
            ->assertJsonPath('data.permissions', [Permission::MANAGE_CATALOGUE]);

        $this->spa()->actingAs($manager)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.permissions.manage_catalogue', true)
            ->assertJsonPath('data.permissions.receive_stock', false)
            ->assertJsonPath('data.permissions.adjust_stock', false)
            ->assertJsonPath('data.permissions.view_costs', false);

        // The server refuses the action, not just the hidden button.
        $this->spa()->actingAs($manager)->postJson('/api/rolls', $this->newRollPayload())->assertForbidden();

        $this->assertSame(1, AuditEvent::where('action', 'role.permissions_updated')->count());
    }

    public function test_a_role_can_be_given_a_permission_it_never_had(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($owner)->putJson('/api/role-permissions/cashier', [
            'permissions' => [Permission::VIEW_COSTS, Permission::MANAGE_CATALOGUE],
        ])->assertOk();

        $this->spa()->actingAs($cashier)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.permissions.view_costs', true)
            ->assertJsonPath('data.permissions.manage_catalogue', true)
            ->assertJsonPath('data.permissions.manage_staff', false);
    }

    public function test_owner_role_cannot_be_limited(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->putJson('/api/role-permissions/owner', [
            'permissions' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('role');
    }

    public function test_owner_only_permissions_cannot_be_granted_to_other_roles(): void
    {
        $owner = $this->userWith(Role::Owner);

        foreach ([Permission::MANAGE_STAFF, Permission::VIEW_AUDIT] as $permission) {
            $this->spa()->actingAs($owner)->putJson('/api/role-permissions/manager', [
                'permissions' => [$permission],
            ])->assertStatus(422)->assertJsonValidationErrors('permissions.0');
        }

        $this->spa()->actingAs($owner)->putJson('/api/role-permissions/manager', [
            'permissions' => ['not_a_permission'],
        ])->assertStatus(422);
    }

    public function test_permission_fingerprint_changes_without_a_new_login(): void
    {
        $owner = $this->userWith(Role::Owner);
        $manager = $this->userWith(Role::Manager);

        $fingerprint = fn () => $this->spa()->actingAs($manager)->getJson('/api/session/permissions')
            ->assertOk()
            ->json('data.fingerprint');

        $first = $fingerprint();
        $this->assertSame($first, $fingerprint());

        $this->spa()->actingAs($owner)->putJson('/api/role-permissions/manager', [
            'permissions' => [Permission::VIEW_COSTS],
        ])->assertOk();

        $this->assertNotSame($first, $fingerprint());
    }

    public function test_guests_cannot_read_the_permission_fingerprint(): void
    {
        $this->getJson('/api/session/permissions')->assertUnauthorized();
    }

    public function test_only_owners_can_read_or_change_role_permissions(): void
    {
        $manager = $this->userWith(Role::Manager);
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($manager)->getJson('/api/role-permissions')->assertForbidden();
        $this->spa()->actingAs($manager)->putJson('/api/role-permissions/cashier', ['permissions' => []])->assertForbidden();
        $this->spa()->actingAs($cashier)->getJson('/api/role-permissions')->assertForbidden();
    }
}
