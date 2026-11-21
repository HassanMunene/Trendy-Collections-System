<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Services\Audit;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_reads_the_audit_trail_newest_first(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier, ['username' => 'amina']);

        Audit::record($owner, 'staff.created', $cashier, ['username' => 'amina', 'role' => 'cashier']);
        Audit::record($cashier, 'auth.login', $cashier);

        $this->spa()->actingAs($owner)->getJson('/api/audit-events')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.action', 'auth.login')
            ->assertJsonPath('data.0.actor.username', 'amina')
            ->assertJsonPath('data.0.actor.role', 'cashier')
            ->assertJsonPath('data.1.action', 'staff.created')
            ->assertJsonPath('data.1.details.username', 'amina')
            ->assertJsonPath('data.1.entity_type', 'users');
    }

    public function test_system_events_have_no_actor(): void
    {
        $owner = $this->userWith(Role::Owner);
        Audit::record(null, 'staff.superadmin_created', 'users', ['via' => 'env'], 99);

        $this->spa()->actingAs($owner)->getJson('/api/audit-events')
            ->assertOk()
            ->assertJsonPath('data.0.actor', null)
            ->assertJsonPath('data.0.details.via', 'env');
    }

    public function test_events_can_be_filtered_by_group_search_actor_and_date(): void
    {
        $owner = $this->userWith(Role::Owner);
        $cashier = $this->userWith(Role::Cashier, ['name' => 'Amina Yusuf']);

        Audit::record($owner, 'staff.created', $cashier, ['username' => 'amina']);
        Audit::record($owner, 'supplier.created', 'suppliers', ['name' => 'Mama Njeri Textiles'], 5);
        Audit::record($cashier, 'roll.received', 'rolls', ['tag' => 'R00031'], 31);
        Audit::record($owner, 'auth.login', $owner);

        DB::table('audit_events')->insert([
            'actor_id' => $owner->id,
            'action' => 'fabric.updated',
            'entity_type' => 'fabrics',
            'entity_id' => 7,
            'details' => json_encode(['code' => 'F-OLD']),
            'ip_address' => '127.0.0.1',
            'created_at' => now()->subDays(10),
        ]);

        $get = fn (string $query) => $this->spa()->actingAs($owner)->getJson('/api/audit-events?'.$query);

        $get('group=staff')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'staff.created');
        $get('group=stock')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'roll.received');
        $get('q=staff.created')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'staff.created');
        $get('q=Mama+Njeri')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'supplier.created');
        $get('q=Amina+Yusuf')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'roll.received');
        $get('actor_id='.$cashier->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'roll.received');
        $get('from='.now()->subDays(1)->toDateString())->assertOk()->assertJsonCount(4, 'data');
        $get('to='.now()->subDays(5)->toDateString())->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'fabric.updated');
        $get('group=unknown')->assertStatus(422);
    }

    public function test_only_owners_can_read_the_audit_trail(): void
    {
        $owner = $this->userWith(Role::Owner);
        $manager = $this->userWith(Role::Manager);
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($manager)->getJson('/api/audit-events')->assertForbidden();
        $this->spa()->actingAs($cashier)->getJson('/api/audit-events')->assertForbidden();

        $this->spa()->actingAs($owner)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.permissions.view_audit', true);
        $this->spa()->actingAs($manager)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.permissions.view_audit', false);

        $this->assertSame(0, AuditEvent::count());
    }

    public function test_audit_events_cannot_be_edited_or_deleted(): void
    {
        $owner = $this->userWith(Role::Owner);
        $event = Audit::record($owner, 'auth.login', $owner);

        $this->expectException(QueryException::class);
        DB::table('audit_events')->where('id', $event->id)->delete();
    }
}
