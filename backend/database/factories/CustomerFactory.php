<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Customer> */
class CustomerFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->company(),
            'phone' => null,
            'stall' => '',
            'notes' => '',
            'active' => true,
            'created_by' => User::factory(),
        ];
    }

    /** A neighbouring shop in the same building, known by its stall code. */
    public function stall(string $stall): static
    {
        return $this->state(fn () => ['stall' => $stall]);
    }
}
