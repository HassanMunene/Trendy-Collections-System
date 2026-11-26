import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { MoneyMethod } from '../api/types'
import { cx } from '../lib/cx'
import { EXPENSE_CATEGORIES } from '../lib/payments'
import { formatKes, shillingsToCents } from '../lib/units'
import { Drawer } from './Drawer'
import { MethodPicker } from './MethodPicker'
import { useToast } from './toast-context'
import { Button, ErrorNotice, Field, Input, UnitInput } from './ui'

/** Money paid out of the shop. Cash expenses come off what the drawer should hold. */
export function ExpenseDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<MoneyMethod>('cash')
  const [paidTo, setPaidTo] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errors: Record<string, string> = {}
    const cents = shillingsToCents(amount)
    if (!category) errors.category = 'Choose what the money was for.'
    if (cents === null || cents <= 0) errors.amount_cents = 'Enter the amount, e.g. 200'
    if (Object.keys(errors).length || cents === null) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.recordExpense({ category, amount_cents: cents, method, paid_to: paidTo.trim(), description: description.trim() })
      qc.invalidateQueries({ queryKey: ['day-book'] })
      toast.success(`Expense of ${formatKes(cents)} recorded.`)
      onClose()
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title="Record an expense"
      description="Money paid out: transport, tailor pay, lunch…"
      footer={
        <Button type="submit" form="expense-form" busy={busy}>
          Save expense
        </Button>
      }
    >
      <form id="expense-form" onSubmit={submit} className="grid gap-4" noValidate>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-plum-700">What was it for?</legend>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={category === c.key}
                onClick={() => setCategory(c.key)}
                className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold transition', category === c.key ? 'border-rose bg-rose text-white' : 'border-line bg-white text-plum hover:bg-blush-100')}
              >
                {c.label}
              </button>
            ))}
          </div>
          {f.category && <p className="mt-1 text-sm font-medium text-danger">{f.category}</p>}
        </fieldset>
        <Field label="Amount" error={f.amount_cents}>
          {(a) => <UnitInput {...a} unit="KES" unitFirst value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200" />}
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-plum-700">Paid with</p>
          <MethodPicker methods={['cash', 'send_money', 'paybill']} value={method} onChange={setMethod} labels={{ paybill: 'Paybill' }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid to" hint="Optional, e.g. boda rider, Wanjiru (tailor)">
            {(a) => <Input {...a} value={paidTo} onChange={(e) => setPaidTo(e.target.value)} />}
          </Field>
          <Field label="Details" hint="Optional">
            {(a) => <Input {...a} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
        </div>
        {problem && !f.category && !f.amount_cents && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
