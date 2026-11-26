<?php

namespace App\Services;

use App\Exceptions\StockRuleViolation;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class ExpenseRecorder
{
    /** @param array{category: string, amount_cents: int, method: string, paid_to?: string|null, description?: string|null} $data */
    public function record(User $actor, array $data): Expense
    {
        $expense = Expense::create([
            'category' => $data['category'],
            'amount_cents' => $data['amount_cents'],
            'method' => $data['method'],
            'paid_to' => trim((string) ($data['paid_to'] ?? '')),
            'description' => trim((string) ($data['description'] ?? '')),
            'recorded_by' => $actor->id,
        ]);
        Audit::record($actor, 'expense.recorded', $expense, [
            'category' => $expense->category,
            'amount_cents' => $expense->amount_cents,
            'method' => $expense->method,
        ]);

        return $expense;
    }

    public function void(User $actor, Expense $expense, string $reason): Expense
    {
        $reason = trim($reason);
        if ($reason === '') {
            throw StockRuleViolation::on('reason', 'Say why the expense is being voided.');
        }

        return DB::transaction(function () use ($actor, $expense, $reason) {
            $locked = Expense::query()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            if ($locked->voided_at !== null) {
                throw StockRuleViolation::on('reason', 'This expense is already voided.');
            }
            $locked->update(['voided_at' => now(), 'voided_by' => $actor->id, 'void_reason' => $reason]);
            Audit::record($actor, 'expense.voided', $locked, ['amount_cents' => $locked->amount_cents, 'reason' => $reason]);

            return $locked;
        });
    }
}
