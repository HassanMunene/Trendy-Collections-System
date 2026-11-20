<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['actor_id', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'user_agent'];

    protected function casts(): array
    {
        return ['details' => 'array'];
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
