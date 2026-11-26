<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\SewingBatch;
use App\Models\SewingBatchInput;
use App\Models\SewingBatchOutput;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Sewing for the shelf: the fabric a tailor used comes off its rolls and the curtains,
 * sheers or cases made go onto the shelf, in one transaction, credited to the tailor.
 */
final class SewingRecorder
{
    public function __construct(
        private StockItemLedger $items,
        private StockLedger $rolls,
    ) {}

    /**
     * @param  list<array{roll_id: int, used_cm: int}>  $inputs
     * @param  list<array{stock_item_id: int, quantity: int}>  $outputs
     */
    public function record(User $recordedBy, User $tailor, array $inputs, array $outputs, string $note = ''): SewingBatch
    {
        return DB::transaction(function () use ($recordedBy, $tailor, $inputs, $outputs, $note) {
            $batch = SewingBatch::create([
                'sewn_by' => $tailor->id,
                'recorded_by' => $recordedBy->id,
                'note' => trim($note),
            ]);
            $ref = "Sewn by {$tailor->name}";

            $rollIds = array_unique(array_column($inputs, 'roll_id'));
            sort($rollIds);
            $rolls = [];
            foreach ($rollIds as $id) {
                $rolls[$id] = $this->rolls->lockedRoll($id);
            }
            foreach ($inputs as $i => $input) {
                $roll = $rolls[$input['roll_id']];
                if ($roll->status === 'written_off') {
                    throw StockRuleViolation::on("inputs.{$i}.roll_id", "Roll {$roll->tag} is written off.");
                }
                SewingBatchInput::create(['sewing_batch_id' => $batch->id] + $input);
                try {
                    $this->rolls->post($roll, -$input['used_cm'], 'cut', $recordedBy, 'sewing_batches', $batch->id, $ref);
                } catch (ValidationException $e) {
                    throw StockRuleViolation::on("inputs.{$i}.used_cm", $e->getMessage());
                }
            }

            $itemIds = array_unique(array_column($outputs, 'stock_item_id'));
            sort($itemIds);
            $items = [];
            foreach ($itemIds as $id) {
                $items[$id] = $this->items->lockedItem($id);
            }
            foreach ($outputs as $i => $output) {
                $item = $items[$output['stock_item_id']];
                if (! $item->isProduct() || ! $item->tracks_stock || ! $item->active) {
                    throw StockRuleViolation::on("outputs.{$i}.stock_item_id", "{$item->name} is not a product that is kept in stock.");
                }
                SewingBatchOutput::create(['sewing_batch_id' => $batch->id] + $output);
                $this->items->post($item, $output['quantity'], 'production', $recordedBy, 'sewing_batches', $batch->id, $ref);
            }

            Audit::record($recordedBy, 'sewing.recorded', $batch, [
                'sewn_by' => $tailor->id,
                'used_cm' => array_sum(array_column($inputs, 'used_cm')),
                'pieces' => array_sum(array_column($outputs, 'quantity')),
            ]);

            return $batch;
        });
    }
}
