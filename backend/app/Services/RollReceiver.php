<?php

namespace App\Services;

use App\Models\Fabric;
use App\Models\Roll;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Receives one physical roll. In the same transaction it can also create the fabric design
 * and supplier, so staff fill one form at the counter.
 */
final class RollReceiver
{
    public function __construct(private StockLedger $ledger) {}

    /**
     * @param  array<string, mixed>  $roll  validated roll fields (received_cm, cost_cents...)
     * @param  array<string, mixed>|null  $newFabric  fields for a new fabric, or null when fabric_id is given
     * @param  array<string, mixed>|null  $newSupplier
     */
    public function receive(User $actor, array $roll, ?array $newFabric, ?array $newSupplier): Roll
    {
        return DB::transaction(function () use ($actor, $roll, $newFabric, $newSupplier) {
            if ($newFabric !== null) {
                $fabric = Fabric::create($newFabric + [
                    'code' => $this->nextFabricCode(),
                    'created_by' => $actor->id,
                ]);
                Audit::record($actor, 'fabric.created', $fabric, ['code' => $fabric->code, 'via' => 'roll_receipt']);
                $roll['fabric_id'] = $fabric->id;
            }

            if ($newSupplier !== null) {
                $supplier = Supplier::firstOrCreate(
                    [
                        'name' => $newSupplier['name'],
                        'building' => $newSupplier['building'] ?? '',
                        'stall' => $newSupplier['stall'] ?? '',
                    ],
                    ['phone' => $newSupplier['phone'] ?? null],
                );
                $roll['supplier_id'] = $supplier->id;
            }

            $tag = isset($roll['tag']) && trim((string) $roll['tag']) !== ''
                ? strtoupper(trim((string) $roll['tag']))
                : $this->nextRollTag();

            $created = Roll::create(array_merge($roll, [
                'tag' => $tag,
                'balance_cm' => 0,
                'status' => 'active',
                'received_by' => $actor->id,
            ]));

            $locked = $this->ledger->lockedRoll($created->id);
            $this->ledger->post($locked, $locked->received_cm, 'receipt', $actor, 'rolls', $locked->id);

            Audit::record($actor, 'roll.received', $locked, [
                'tag' => $locked->tag,
                'stated_cm' => $locked->stated_cm,
                'received_cm' => $locked->received_cm,
                'cost_cents' => $locked->cost_cents,
            ]);

            return $locked->refresh();
        });
    }

    public function nextRollTag(): string
    {
        do {
            $n = (int) DB::selectOne("SELECT nextval('roll_tag_seq') AS n")->n;
            $tag = sprintf('R%05d', $n);
        } while (Roll::where('tag', $tag)->exists()); // skip tags already typed in by hand

        return $tag;
    }

    public function nextFabricCode(): string
    {
        do {
            $n = (int) DB::selectOne("SELECT nextval('fabric_code_seq') AS n")->n;
            $code = sprintf('F%04d', $n);
        } while (Fabric::where('code', $code)->exists());

        return $code;
    }
}
