<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditEvent;
use App\Models\Fabric;
use App\Models\Roll;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RollReceivingTest extends TestCase
{
    use RefreshDatabase;

    public function test_receiving_a_50m_roll_with_new_fabric_and_supplier(): void
    {
        $owner = $this->userWith(Role::Owner);

        // Postgres sequences are not rolled back between tests, so check the format, not the number.
        $res = $this->receiveRoll($owner)->assertCreated()
            ->assertJsonPath('data.balance_cm', 5000)
            ->assertJsonPath('data.fabric.display_name', 'Cream Woven Linen · Damask')
            ->assertJsonPath('data.supplier.phone', '254712345678')
            ->assertJsonPath('data.cost_cents', 2000000);

        $this->assertMatchesRegularExpression('/^R\d{5}$/', $res->json('data.tag'));
        $this->assertMatchesRegularExpression('/^F\d{4}$/', $res->json('data.fabric.code'));
        $roll = Roll::findOrFail($res->json('data.id'));
        $movements = StockMovement::where('roll_id', $roll->id)->get();
        $this->assertCount(1, $movements);
        $this->assertSame('receipt', $movements[0]->kind);
        $this->assertSame(5000, $movements[0]->change_cm);
        $this->assertSame($owner->id, $movements[0]->actor_id);
        $this->assertSame(1, Fabric::count());
        $this->assertSame(1, Supplier::count());
        $this->assertTrue(AuditEvent::where('action', 'roll.received')->where('entity_id', $roll->id)->exists());
    }

    public function test_second_roll_reuses_existing_fabric_and_supplier(): void
    {
        $manager = $this->userWith(Role::Manager);
        $first = $this->receivedRoll($manager);

        $payload = $this->newRollPayload(['received_cm' => 4000, 'stated_cm' => 4200]);
        unset($payload['fabric'], $payload['supplier']);
        $payload['fabric_id'] = $first->fabric_id;
        $payload['supplier_id'] = $first->supplier_id;

        $second = $this->spa()->actingAs($manager)->postJson('/api/rolls', $payload)
            ->assertCreated()
            ->assertJsonPath('data.stated_cm', 4200)
            ->assertJsonPath('data.balance_cm', 4000);
        $this->assertGreaterThan($first->tag, $second->json('data.tag'));

        $this->assertSame(1, Fabric::count());
        $this->assertSame(2, Roll::where('fabric_id', $first->fabric_id)->count());
    }

    public function test_handwritten_tag_is_kept_and_must_be_unique(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->receiveRoll($owner, ['tag' => 'old-14'])->assertCreated()->assertJsonPath('data.tag', 'OLD-14');
        $this->receiveRoll($owner, ['tag' => 'OLD-14'])->assertStatus(422)->assertJsonValidationErrors('tag');
    }

    public function test_cannot_send_both_an_existing_and_a_new_fabric(): void
    {
        $owner = $this->userWith(Role::Owner);
        $first = $this->receivedRoll($owner);

        $this->receiveRoll($owner, ['fabric_id' => $first->fabric_id])
            ->assertStatus(422)->assertJsonValidationErrors('fabric_id');
    }

    public function test_received_length_must_be_positive(): void
    {
        $owner = $this->userWith(Role::Owner);
        $this->receiveRoll($owner, ['received_cm' => 0])->assertStatus(422)->assertJsonValidationErrors('received_cm');
        $this->assertSame(0, Roll::count());
    }

    public function test_cashier_cutter_tailor_cannot_receive_stock(): void
    {
        foreach ([Role::Cashier, Role::Cutter, Role::Tailor] as $role) {
            $this->receiveRoll($this->userWith($role))->assertForbidden();
        }
        $this->assertSame(0, Roll::count());
    }

    public function test_cashier_can_see_rolls_but_not_purchase_costs(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner));
        $cashier = $this->userWith(Role::Cashier);

        $list = $this->spa()->actingAs($cashier)->getJson('/api/rolls')->assertOk();
        $this->assertSame(5000, $list->json('data.0.balance_cm'));
        $this->assertArrayNotHasKey('cost_cents', $list->json('data.0'));
        $this->assertArrayNotHasKey('supplier', $list->json('data.0'));

        $detail = $this->spa()->actingAs($cashier)->getJson("/api/rolls/{$roll->id}")->assertOk();
        $this->assertArrayNotHasKey('cost_cents', $detail->json('data'));
        $this->assertCount(1, $detail->json('movements'));
    }

    public function test_roll_search_finds_by_colour_and_tag(): void
    {
        $owner = $this->userWith(Role::Owner);
        $roll = $this->receivedRoll($owner);

        $this->spa()->actingAs($owner)->getJson('/api/rolls?q=cream')->assertOk()->assertJsonCount(1, 'data');
        $this->spa()->actingAs($owner)->getJson('/api/rolls?q='.strtolower($roll->tag))->assertOk()->assertJsonCount(1, 'data');
        $this->spa()->actingAs($owner)->getJson('/api/rolls?q=velvet')->assertOk()->assertJsonCount(0, 'data');
    }
}
