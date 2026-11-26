<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovementResource;
use App\Http\Resources\RollResource;
use App\Http\Resources\StockItemResource;
use App\Models\Roll;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Services\ShopToday;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/** Home screen: today's money and what needs attention (ShopToday), then stock. */
class DashboardController extends Controller
{
    public function __invoke(Request $request, ShopToday $shop): JsonResponse
    {
        $byCategory = DB::table('rolls')
            ->join('fabrics', 'fabrics.id', '=', 'rolls.fabric_id')
            ->join('fabric_categories', 'fabric_categories.id', '=', 'fabrics.fabric_category_id')
            ->where('rolls.status', 'active')
            ->groupBy('fabric_categories.id', 'fabric_categories.name')
            ->orderBy('fabric_categories.name')
            ->select('fabric_categories.id', 'fabric_categories.name')
            ->selectRaw('COUNT(*)::int AS rolls, SUM(rolls.balance_cm)::bigint AS balance_cm')
            ->get()
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'rolls' => (int) $r->rolls, 'balance_cm' => (int) $r->balance_cm]);

        $startOfDay = now('Africa/Nairobi')->startOfDay()->utc();
        $startOfWeek = now('Africa/Nairobi')->startOfWeek()->utc();

        $data = [
            'active_rolls' => Roll::where('status', 'active')->count(),
            'balance_cm' => (int) Roll::where('status', 'active')->sum('balance_cm'),
            'by_category' => $byCategory,
            'received_this_week' => [
                'rolls' => Roll::where('created_at', '>=', $startOfWeek)->count(),
                'cm' => (int) StockMovement::where('kind', 'receipt')->where('created_at', '>=', $startOfWeek)->sum('change_cm'),
            ],
            'corrections_today' => StockMovement::where('kind', 'adjustment')->where('created_at', '>=', $startOfDay)->count(),
            'low_rolls' => RollResource::collection(
                Roll::low()->with(['fabric.category', 'fabric.materialType', 'fabric.texture', 'fabric.colour', 'supplier'])
                    ->orderBy('balance_cm')->limit(10)->get()
            )->resolve(),
            'recent_movements' => MovementResource::collection(
                StockMovement::with(['actor', 'roll'])->orderByDesc('id')->limit(10)->get()
            )->resolve(),
        ];

        $data['low_products'] = StockItemResource::collection(
            StockItem::products()->low()->with(['category', 'colour'])->orderBy('quantity')->limit(10)->get()
        )->resolve();

        if (Gate::allows('view-costs')) {
            // Value of what is left, at each roll's purchase cost per metre.
            $data['stock_value_cents'] = (int) DB::table('rolls')->where('status', 'active')
                ->selectRaw('COALESCE(SUM(ROUND(cost_cents::numeric * balance_cm / received_cm)), 0)::bigint AS v')
                ->value('v');
        }

        return response()->json(['data' => [...$data, ...$shop->build($request->user())]]);
    }
}
