<?php

namespace Tests\Feature;

use App\Enums\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_sign_in_with_username_in_any_case(): void
    {
        $this->userWith(Role::Tailor, ['username' => 'Amina', 'password' => 'secret-123']);

        $this->spa()->postJson('/api/login', ['login' => 'amina', 'password' => 'secret-123'])
            ->assertOk()
            ->assertJsonPath('data.username', 'Amina')
            ->assertJsonPath('data.permissions.adjust_stock', false);

        $this->spa()->getJson('/api/me')->assertOk()->assertJsonPath('data.role', 'tailor');
    }

    public function test_staff_can_sign_in_with_a_local_phone_number(): void
    {
        $this->userWith(Role::Cashier, ['phone' => '254712345678', 'password' => 'secret-123']);

        $this->spa()->postJson('/api/login', ['login' => '0712 345 678', 'password' => 'secret-123'])->assertOk();
    }

    public function test_wrong_password_and_unknown_user_get_the_same_message(): void
    {
        $this->userWith(Role::Cashier, ['username' => 'wanjiru', 'password' => 'secret-123']);

        $wrong = $this->spa()->postJson('/api/login', ['login' => 'wanjiru', 'password' => 'nope'])->assertStatus(422);
        $unknown = $this->spa()->postJson('/api/login', ['login' => 'nobody', 'password' => 'nope'])->assertStatus(422);
        $this->assertSame($wrong->json('errors.login'), $unknown->json('errors.login'));
        $this->assertGuest('web');
    }

    public function test_switched_off_account_cannot_sign_in(): void
    {
        $this->userWith(Role::Cashier, ['username' => 'old', 'password' => 'secret-123', 'active' => false]);

        $this->spa()->postJson('/api/login', ['login' => 'old', 'password' => 'secret-123'])
            ->assertStatus(422)->assertJsonValidationErrors('login');
        $this->assertGuest('web');
    }

    public function test_login_is_rate_limited(): void
    {
        $this->userWith(Role::Cashier, ['username' => 'target', 'password' => 'secret-123']);
        for ($i = 0; $i < 5; $i++) {
            $this->spa()->postJson('/api/login', ['login' => 'target', 'password' => 'guess'.$i])->assertStatus(422);
        }
        $this->spa()->postJson('/api/login', ['login' => 'target', 'password' => 'secret-123'])->assertStatus(429);
    }

    public function test_guest_cannot_reach_the_api(): void
    {
        $this->spa()->getJson('/api/rolls')->assertUnauthorized();
        $this->spa()->getJson('/api/dashboard')->assertUnauthorized();
    }

    public function test_temporary_password_must_be_changed_before_using_the_shop_screens(): void
    {
        $user = $this->userWith(Role::Cashier, ['password' => 'temporary1', 'must_change_password' => true]);

        $this->spa()->actingAs($user)->getJson('/api/rolls')
            ->assertForbidden()->assertJsonPath('code', 'password_change_required');
        $this->spa()->actingAs($user)->getJson('/api/me')->assertOk();

        $this->spa()->actingAs($user)->postJson('/api/me/password', [
            'current_password' => 'temporary1',
            'password' => 'my-own-pass',
            'password_confirmation' => 'my-own-pass',
        ])->assertOk()->assertJsonPath('data.must_change_password', false);

        $this->spa()->actingAs($user->fresh())->getJson('/api/rolls')->assertOk();
    }

    public function test_change_password_requires_the_current_one(): void
    {
        $user = $this->userWith(Role::Cashier, ['password' => 'secret-123']);

        $this->spa()->actingAs($user)->postJson('/api/me/password', [
            'current_password' => 'wrong',
            'password' => 'another-pass',
            'password_confirmation' => 'another-pass',
        ])->assertStatus(422)->assertJsonValidationErrors('current_password');
    }
}
