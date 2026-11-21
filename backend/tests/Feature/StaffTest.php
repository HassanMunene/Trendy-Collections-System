<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_creates_a_staff_account_that_must_set_its_own_password(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->postJson('/api/staff', [
            'name' => 'Amina Hassan',
            'username' => 'amina',
            'phone' => '0722 000 111',
            'role' => 'tailor',
            'password' => 'first-pass-1',
        ])->assertCreated()
            ->assertJsonPath('data.phone', '254722000111')
            ->assertJsonPath('data.must_change_password', true);

        $this->assertDatabaseHas('audit_events', ['action' => 'staff.created', 'actor_id' => $owner->id]);
    }

    public function test_usernames_are_unique_regardless_of_case(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->userWith(Role::Tailor, ['username' => 'Amina']);

        $this->spa()->actingAs($owner)->postJson('/api/staff', [
            'name' => 'Other', 'username' => 'AMINA', 'role' => 'tailor', 'password' => 'first-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('username');
    }

    public function test_only_owner_can_manage_staff(): void
    {
        foreach ([Role::Manager, Role::Cashier, Role::Cutter, Role::Tailor] as $role) {
            $user = $this->userWith($role);
            $this->spa()->actingAs($user)->getJson('/api/staff')->assertForbidden();
            $this->spa()->actingAs($user)->postJson('/api/staff', [
                'name' => 'X', 'username' => 'x'.$role->value, 'role' => 'owner', 'password' => 'first-pass-1',
            ])->assertForbidden();
        }
    }

    public function test_owner_cannot_switch_off_themselves_or_the_last_owner(): void
    {
        $owner = $this->userWith(Role::Owner);

        $this->spa()->actingAs($owner)->postJson("/api/staff/{$owner->id}/active", ['active' => false])
            ->assertStatus(422);
        $this->spa()->actingAs($owner)->patchJson("/api/staff/{$owner->id}", [
            'name' => $owner->name, 'username' => $owner->username, 'role' => 'manager',
        ])->assertStatus(422)->assertJsonValidationErrors('role');

        $this->assertSame(Role::Owner, $owner->fresh()->role);
    }

    public function test_switching_off_staff_and_reset_password(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($owner)->postJson("/api/staff/{$cashier->id}/active", ['active' => false])
            ->assertOk()->assertJsonPath('data.active', false);

        $temp = $this->spa()->actingAs($owner)->postJson("/api/staff/{$cashier->id}/reset-password")
            ->assertOk()->json('data.temporary_password');
        $this->assertTrue(Hash::check($temp, $cashier->fresh()->password));
        $this->assertTrue($cashier->fresh()->must_change_password);
    }

    public function test_ordinary_owner_cannot_change_the_superadmin(): void
    {
        $owner = $this->userWith(Role::Owner);
        $super = User::factory()->superadmin()->create();

        $this->spa()->actingAs($owner)->postJson("/api/staff/{$super->id}/reset-password")->assertForbidden();
        $this->spa()->actingAs($owner)->postJson("/api/staff/{$super->id}/active", ['active' => false])->assertForbidden();
        $this->assertSame(0, AuditEvent::where('action', 'staff.password_reset')->count());
    }

    public function test_superadmin_flag_cannot_be_set_through_the_api(): void
    {
        $owner = $this->userWith(Role::Owner);

        $id = $this->spa()->actingAs($owner)->postJson('/api/staff', [
            'name' => 'Sneaky', 'username' => 'sneaky', 'role' => 'owner', 'password' => 'first-pass-1', 'is_superadmin' => true,
        ])->assertCreated()->json('data.id');

        $this->assertFalse(User::find($id)->is_superadmin);
    }

    public function test_create_owner_command(): void
    {
        $this->artisan('trendy:create-owner', [
            '--superadmin' => true, '--name' => 'Mum', '--username' => 'mum', '--phone' => '0711222333', '--password' => 'strong-pass-1',
        ])->assertSuccessful();

        $mum = User::where('username', 'mum')->firstOrFail();
        $this->assertTrue($mum->is_superadmin);
        $this->assertSame('254711222333', $mum->phone);

        $this->artisan('trendy:create-owner', [
            '--superadmin' => true, '--name' => 'Two', '--username' => 'two', '--password' => 'strong-pass-1',
        ])->assertFailed();
    }

    public function test_ensure_superadmin_command_creates_it_from_config_once(): void
    {
        config([
            'trendy.superadmin.name' => 'Shop Owner',
            'trendy.superadmin.username' => 'boss',
            'trendy.superadmin.phone' => '0711 000 222',
            'trendy.superadmin.password' => 'env-pass-123',
        ]);

        $this->artisan('trendy:ensure-superadmin')->assertSuccessful();

        $boss = User::where('username', 'boss')->firstOrFail();
        $this->assertTrue($boss->is_superadmin);
        $this->assertTrue($boss->active);
        $this->assertFalse($boss->must_change_password);
        $this->assertSame('254711000222', $boss->phone);
        $this->assertTrue(Hash::check('env-pass-123', $boss->password));

        // Running again (every deploy) must not duplicate or reset the account.
        $boss->update(['password' => 'changed-in-app-1']);
        $this->artisan('trendy:ensure-superadmin')->assertSuccessful();

        $this->assertSame(1, User::where('is_superadmin', true)->count());
        $this->assertTrue(Hash::check('changed-in-app-1', $boss->fresh()->password));
    }

    public function test_ensure_superadmin_command_skips_when_credentials_are_not_configured(): void
    {
        config([
            'trendy.superadmin.username' => null,
            'trendy.superadmin.password' => null,
        ]);

        $this->artisan('trendy:ensure-superadmin')->assertSuccessful();

        $this->assertSame(0, User::count());
    }
}
