<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

final class Audit
{
    /** @param array<string, mixed> $details */
    public static function record(?User $actor, string $action, Model|string $entity, array $details = [], ?int $entityId = null): AuditEvent
    {
        $request = app()->runningInConsole() && ! app()->runningUnitTests() ? null : request();

        return AuditEvent::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'entity_type' => $entity instanceof Model ? $entity->getTable() : $entity,
            'entity_id' => $entity instanceof Model ? $entity->getKey() : $entityId,
            'details' => $details,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? mb_substr((string) $request->userAgent(), 0, 500) : 'console',
        ]);
    }
}
