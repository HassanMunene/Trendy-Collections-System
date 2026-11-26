import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { DayBook } from '../api/types'
import { cx } from '../lib/cx'
import { formatDate, formatKes, shillingsToCents } from '../lib/units'
import { Drawer } from './Drawer'
import { useToast } from './toast-context'
import { Button, DetailList, ErrorNotice, Field, Input, UnitInput } from './ui'

/** Count the drawer at closing and see at once whether it matches. */
export function CashCountDrawer({ book, onClose }: { book: DayBook; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const m = book.money
  const [counted, setCounted] = useState('')
  const [kept, setKept] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  const countedCents = counted.trim() ? shillingsToCents(counted) : null
  const difference = countedCents === null ? null : countedCents - m.expected_cash_cents

  async function submit(e: FormEvent) {
    e.preventDefault()
    const keptCents = kept.trim() ? shillingsToCents(kept) : 0
    const errors: Record<string, string> = {}
    if (countedCents === null) errors.counted_cents = 'Enter the cash you counted, e.g. 6,660'
    if (keptCents === null) errors.kept_cents = 'Enter an amount in shillings, or leave it empty.'
    if (difference !== null && difference !== 0 && !note.trim()) errors.note = 'The count is different; say what you think happened.'
    if (Object.keys(errors).length || countedCents === null || keptCents === null) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const count = await api.countCash({ date: book.date, counted_cents: countedCents, kept_cents: keptCents, note: note.trim() })
      qc.invalidateQueries({ queryKey: ['day-book'] })
      toast.success(count.difference_cents === 0 ? 'Cash counted. The drawer matches.' : `Cash counted. ${count.difference_cents > 0 ? 'Over' : 'Short'} by ${formatKes(Math.abs(count.difference_cents))}.`)
      onClose()
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  const cashIn = m.sales_in.cash + m.order_payments_in.cash + m.account_payments_in.cash
  return (
    <Drawer
      onClose={onClose}
      title="Count the cash"
      description={`${book.weekday}, ${formatDate(book.date)}`}
      footer={
        <Button type="submit" form="cash-count-form" busy={busy}>
          Save count
        </Button>
      }
    >
      <form id="cash-count-form" onSubmit={submit} className="grid gap-5" noValidate>
        <section className="rounded-2xl bg-blush-50 p-4">
          <DetailList
            items={[
              ['Left in the drawer last time', formatKes(m.opening_cash_cents)],
              ['+ Cash sales, orders and debt payments', formatKes(cashIn)],
              ['− Cash refunds', formatKes(m.refunds_out.cash)],
              ['− Cash expenses', formatKes(m.expenses_out.cash)],
            ]}
          />
          <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="font-semibold text-plum">The drawer should have</span>
            <span className="tabular font-display text-3xl text-plum">{formatKes(m.expected_cash_cents)}</span>
          </div>
        </section>

        <Field label="Cash you counted" error={f.counted_cents}>
          {(a) => <UnitInput {...a} unit="KES" unitFirst value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />}
        </Field>
        {difference !== null && (
          <p className={cx('-mt-3 text-sm font-bold', difference === 0 ? 'text-success' : 'text-danger')}>
            {difference === 0 ? 'Matches exactly.' : `${difference > 0 ? 'Over' : 'Short'} by ${formatKes(Math.abs(difference))}.`}
          </p>
        )}
        <Field label="Left in the drawer for tomorrow" error={f.kept_cents} hint="The float. Leave empty if all the cash was taken home or banked.">
          {(a) => <UnitInput {...a} unit="KES" unitFirst value={kept} onChange={(e) => setKept(e.target.value)} />}
        </Field>
        <Field label="Note" error={f.note} hint={difference ? 'Needed when the count is different.' : 'Optional'}>
          {(a) => <Input {...a} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {problem && !Object.keys(f).length && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
