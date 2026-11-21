<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditEventResource;
use App\Models\AuditEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * The audit trail is append-only (a database trigger blocks updates and deletes).
 * This endpoint only reads it, and only an owner may do so.
 */
class AuditLogController extends Controller
{
    /** Each filter group maps to the action prefixes it covers. */
    private const GROUPS = [
        'auth' => ['auth'],
        'staff' => ['staff', 'role'],
        'profile' => ['profile'],
        'suppliers' => ['supplier'],
        'catalogue' => ['fabric', 'catalogue'],
        'stock' => ['roll', 'stock_item'],
    ];

    public function __invoke(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('view-audit');

        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'group' => ['nullable', Rule::in(array_keys(self::GROUPS))],
            'actor_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $events = AuditEvent::query()
            ->with('actor')
            ->when($filters['q'] ?? null, fn (Builder $query, string $term) => $this->search($query, $term))
            ->when($filters['group'] ?? null, function (Builder $query, string $group) {
                $query->where(function (Builder $inner) use ($group) {
                    foreach (self::GROUPS[$group] as $prefix) {
                        $inner->orWhere('action', 'like', $prefix.'.%');
                    }
                });
            })
            ->when($filters['actor_id'] ?? null, fn (Builder $query, int $id) => $query->where('actor_id', $id))
            ->when($filters['from'] ?? null, fn (Builder $query, string $date) => $query->where('created_at', '>=', Carbon::parse($date)->startOfDay()))
            ->when($filters['to'] ?? null, fn (Builder $query, string $date) => $query->where('created_at', '<=', Carbon::parse($date)->endOfDay()))
            ->orderByDesc('id')
            ->paginate(50)
            ->withQueryString();

        return AuditEventResource::collection($events);
    }

    private function search(Builder $query, string $term): void
    {
        $like = '%'.addcslashes($term, '%_\\').'%';

        $query->where(function (Builder $inner) use ($like) {
            $inner->where('action', 'ilike', $like)
                ->orWhere('entity_type', 'ilike', $like)
                ->orWhereRaw('details::text ilike ?', [$like])
                ->orWhereHas('actor', fn (Builder $actor) => $actor->where('name', 'ilike', $like)->orWhere('username', 'ilike', $like));
        });
    }
}
