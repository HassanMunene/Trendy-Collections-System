<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_neighbouring_shop_is_saved_with_its_stall_and_a_normalised_phone(): void
    {
        $cashier = $this->userWith(Role::Cashier);

        $this->spa()->actingAs($cashier)->postJson('/api/customers', [
            'name' => ' BS 60 ', 'stall' => '3rd  floor', 'phone' => '0712 403 671',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'BS 60')
            ->assertJsonPath('data.stall', '3rd floor')
            ->assertJsonPath('data.phone', '254712403671');

        $this->spa()->actingAs($cashier)->postJson('/api/customers', ['name' => 'bs 60', 'stall' => '3rd floor'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => 'bs 60 at 3rd floor is already a customer.']);

        $this->spa()->actingAs($cashier)->getJson('/api/customers?q=0712403')
            ->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_a_bad_phone_number_is_refused(): void
    {
        $this->spa()->actingAs($this->userWith(Role::Cashier))->postJson('/api/customers', ['name' => 'Mercy', 'phone' => '12345'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone' => 'Enter a Kenyan mobile number, e.g. 0712 345 678.']);
    }

    public function test_staff_who_do_not_sell_cannot_see_customers(): void
    {
        Customer::factory()->create();

        $this->spa()->actingAs($this->userWith(Role::Tailor))->getJson('/api/customers')->assertForbidden();
    }
}
