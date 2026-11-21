<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_edits_their_own_details(): void
    {
        $user = $this->userWith(Role::Cashier, ['name' => 'Amina', 'username' => 'amina', 'phone' => null]);

        $this->spa()->actingAs($user)->patchJson('/api/me', [
            'name' => 'Amina Hassan',
            'username' => 'amina.h',
            'phone' => '0712 345 678',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Amina Hassan')
            ->assertJsonPath('data.username', 'amina.h')
            ->assertJsonPath('data.phone', '254712345678');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'username' => 'amina.h']);
        $this->assertDatabaseHas('audit_events', ['action' => 'profile.updated', 'actor_id' => $user->id]);
    }

    public function test_username_and_phone_must_stay_unique(): void
    {
        User::factory()->create(['username' => 'taken', 'phone' => '254700000001']);
        $user = $this->userWith(Role::Owner);

        $this->spa()->actingAs($user)->patchJson('/api/me', [
            'name' => 'Someone',
            'username' => 'taken',
            'phone' => '254700000001',
        ])->assertStatus(422)->assertJsonValidationErrors(['username', 'phone']);

        // Keeping your own username and phone is not a clash.
        $this->spa()->actingAs($user)->patchJson('/api/me', [
            'name' => 'Someone Else',
            'username' => $user->username,
            'phone' => $user->phone,
        ])->assertOk();
    }

    public function test_a_photo_can_be_added_replaced_and_removed(): void
    {
        Storage::fake('public');
        $user = $this->userWith(Role::Owner);

        $this->spa()->actingAs($user)->post('/api/me/avatar', ['avatar' => $this->png('first.png')])
            ->assertOk()->assertJsonPath('data.avatar_url', fn ($url) => is_string($url) && str_contains($url, '/storage/avatars/'));

        $first = User::findOrFail($user->id)->avatar_path;
        Storage::disk('public')->assertExists($first);

        $this->spa()->actingAs($user)->post('/api/me/avatar', ['avatar' => $this->png('second.png')])->assertOk();
        $second = User::findOrFail($user->id)->avatar_path;

        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);

        $this->spa()->actingAs($user)->deleteJson('/api/me/avatar')->assertOk()->assertJsonPath('data.avatar_url', null);

        $this->assertNull(User::findOrFail($user->id)->avatar_path);
        Storage::disk('public')->assertMissing($second);
    }

    public function test_only_images_up_to_four_megabytes_are_accepted(): void
    {
        Storage::fake('public');
        $user = $this->userWith(Role::Owner);

        $this->spa()->actingAs($user)->post('/api/me/avatar', [
            'avatar' => UploadedFile::fake()->createWithContent('notes.txt', 'not a picture'),
        ])->assertStatus(422)->assertJsonValidationErrors('avatar');

        $this->spa()->actingAs($user)->post('/api/me/avatar', [
            'avatar' => UploadedFile::fake()->create('huge.png', 5000, 'image/png'),
        ])->assertStatus(422)->assertJsonValidationErrors('avatar');
    }

    public function test_guests_cannot_edit_a_profile(): void
    {
        $this->spa()->patchJson('/api/me', ['name' => 'Ghost', 'username' => 'ghost'])->assertUnauthorized();
        $this->spa()->post('/api/me/avatar')->assertUnauthorized();
    }

    /** A real 1x1 PNG, so the "image" rule can inspect it without the GD extension. */
    private function png(string $name): UploadedFile
    {
        $bytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

        return UploadedFile::fake()->createWithContent($name, $bytes);
    }
}
