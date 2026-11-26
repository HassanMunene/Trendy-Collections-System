<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\SewingBatch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SewingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_tailor_turns_roll_metres_into_curtains_on_the_shelf(): void
    {
        $tailor = $this->userWith(Role::Tailor);
        $roll = $this->receivedRoll($this->userWith(Role::Owner));
        $sets = $this->product('Window curtain', 'Cream');
        $doors = $this->product('Door curtain', 'Cream');

        $this->spa()->actingAs($tailor)->postJson('/api/sewing-batches', [
            'inputs' => [['roll_id' => $roll->id, 'used_cm' => 2400]],
            'outputs' => [
                ['stock_item_id' => $sets->id, 'quantity' => 4],
                ['stock_item_id' => $doors->id, 'quantity' => 2],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.sewn_by.id', $tailor->id)
            ->assertJsonPath('data.inputs.0.used_cm', 2400)
            ->assertJsonPath('data.outputs.0.quantity', 4);

        $this->assertSame(2600, $roll->refresh()->balance_cm);
        $this->assertSame(4, $sets->refresh()->quantity);
        $this->assertSame(2, $doors->refresh()->quantity);
    }

    public function test_a_tailor_cannot_credit_someone_else_but_a_manager_can_record_for_them(): void
    {
        $tailor = $this->userWith(Role::Tailor);
        $other = $this->userWith(Role::Tailor);
        $cases = $this->product('Pillow case', 'White');
        $body = ['inputs' => [], 'outputs' => [['stock_item_id' => $cases->id, 'quantity' => 12]], 'sewn_by' => $other->id];

        $this->spa()->actingAs($tailor)->postJson('/api/sewing-batches', $body)
            ->assertUnprocessable()->assertJsonValidationErrors(['sewn_by' => 'You can only record your own sewing.']);

        $manager = $this->userWith(Role::Manager);
        $this->spa()->actingAs($manager)->postJson('/api/sewing-batches', $body)
            ->assertCreated()
            ->assertJsonPath('data.sewn_by.id', $other->id)
            ->assertJsonPath('data.recorded_by.id', $manager->id);

        // Each tailor sees only their own work.
        $this->spa()->actingAs($tailor)->getJson('/api/sewing-batches')->assertOk()->assertJsonCount(0, 'data');
        $this->spa()->actingAs($other)->getJson('/api/sewing-batches')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_sewing_cannot_use_more_fabric_than_the_roll_has(): void
    {
        $roll = $this->receivedRoll($this->userWith(Role::Owner), ['received_cm' => 500, 'stated_cm' => 500]);
        $sets = $this->product('Window curtain', 'Navy');

        $this->spa()->actingAs($this->userWith(Role::Tailor))->postJson('/api/sewing-batches', [
            'inputs' => [['roll_id' => $roll->id, 'used_cm' => 600]],
            'outputs' => [['stock_item_id' => $sets->id, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('inputs.0.used_cm');

        $this->assertSame(0, SewingBatch::count());
        $this->assertSame(0, $sets->refresh()->quantity);
    }

    public function test_cashiers_cannot_record_sewing(): void
    {
        $sets = $this->product('Window curtain', 'Navy');

        $this->spa()->actingAs($this->userWith(Role::Cashier))->postJson('/api/sewing-batches', [
            'inputs' => [], 'outputs' => [['stock_item_id' => $sets->id, 'quantity' => 1]],
        ])->assertForbidden();
    }
}
