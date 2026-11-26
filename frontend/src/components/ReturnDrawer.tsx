import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { RefundMethod, Sale } from '../api/types'
import { cx } from '../lib/cx'
import { CUSTOMERS_KEY, PRODUCTS_KEY, quantityLabel } from '../lib/useCatalogue'
import { formatKes, shillingsToCents } from '../lib/units'
import { Drawer } from './Drawer'
import { useToast } from './toast-context'
import { Button, ErrorNotice, Field, Input, Notice, UnitInput } from './ui'

const REFUNDS: { key: RefundMethod; label: string; hint: string }[] = [
  { key: 'cash', label: 'Cash back', hint: 'From the drawer' },
  { key: 'send_money', label: 'M-Pesa back', hint: 'Sent from 0712 403 671' },
  { key: 'account', label: 'Off their debt', hint: 'Credit to account' },
  { key: 'none', label: 'Exchange', hint: 'No money back' },
]

/** Goods brought back from a sale: back on the shelf, and the customer paid back. */
export function ReturnDrawer({ sale, onClose, onReturned }: { sale: Sale; onClose: () => void; onReturned: (s: Sale) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const returnable = (sale.lines ?? []).filter((l) => l.kind === 'product' && (l.quantity ?? 0) - l.returned_quantity > 0)
  const [qty, setQty] = useState<Record<number, number>>({})
  const [method, setMethod] = useState<RefundMethod>('cash')
  const [refund, setRefund] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  // What the customer actually paid for the pieces coming back, which is the most that can be refunded.
  const max = returnable.reduce((sum, l) => sum + Math.floor((l.total_cents * (qty[l.id] ?? 0)) / (l.quantity ?? 1)), 0)
  const refundCents = method === 'none' ? 0 : refund === null ? max : shillingsToCents(refund)
  const chosen = returnable.filter((l) => (qty[l.id] ?? 0) > 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (chosen.length === 0) {
      setProblem({ status: 422, message: 'Choose what came back.', fields: {} })
      return
    }
    if (!reason.trim()) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { reason: 'Say why the goods came back.' } })
      return
    }
    if (refundCents === null) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { refund_cents: 'Enter the refund in shillings.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const updated = await api.returnItems(sale.id, {
        lines: chosen.map((l) => ({ sale_line_id: l.id, quantity: qty[l.id] })),
        refund_method: method,
        refund_cents: refundCents,
        reason: reason.trim(),
      })
      ;[PRODUCTS_KEY, CUSTOMERS_KEY, ['day-book'], ['dashboard']].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      toast.success(method === 'none' ? 'Return recorded. Goods are back on the shelf.' : `Return recorded. ${formatKes(refundCents)} ${REFUNDS.find((r) => r.key === method)!.label.toLowerCase()}.`)
      onReturned(updated)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={`Return from ${sale.number}`}
      description={sale.customer?.name ?? (sale.customer_name || 'Walk-in customer')}
      footer={
        <Button type="submit" form="return-form" busy={busy} disabled={returnable.length === 0}>
          Record return
        </Button>
      }
    >
      <form id="return-form" onSubmit={submit} className="grid gap-5" noValidate>
        {returnable.length === 0 && <Notice tone="warn">Everything on this sale has already come back (fabric cut from a roll cannot be returned).</Notice>}
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-display text-lg text-plum">What came back?</legend>
          {returnable.map((l) => {
            const left = (l.quantity ?? 0) - l.returned_quantity
            const n = qty[l.id] ?? 0
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border border-line-soft p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-plum">{l.description}</span>
                  <span className="text-xs text-ink-muted">
                    Sold {quantityLabel(l.quantity ?? 0, l.unit)} for {formatKes(l.total_cents)}
                    {l.returned_quantity > 0 && ` · ${l.returned_quantity} already back`}
                  </span>
                </span>
                <div className="flex items-center gap-1" role="group" aria-label={`How many ${l.description}`}>
                  <button type="button" aria-label="One less" disabled={n === 0} onClick={() => setQty((q) => ({ ...q, [l.id]: n - 1 }))} className="grid size-10 place-items-center rounded-lg bg-blush-200 text-lg font-bold text-plum disabled:opacity-40">
                    −
                  </button>
                  <span className="tabular w-8 text-center text-lg font-semibold">{n}</span>
                  <button type="button" aria-label="One more" disabled={n >= left} onClick={() => setQty((q) => ({ ...q, [l.id]: n + 1 }))} className="grid size-10 place-items-center rounded-lg bg-blush-200 text-lg font-bold text-plum disabled:opacity-40">
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 font-display text-lg text-plum">Paid back how?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REFUNDS.filter((r) => r.key !== 'account' || sale.customer).map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={method === r.key}
                onClick={() => setMethod(r.key)}
                className={cx('min-h-14 rounded-xl border px-2 py-2 text-center transition', method === r.key ? 'border-rose bg-rose text-white' : 'border-line bg-white text-plum hover:bg-blush-100')}
              >
                <span className="block font-bold">{r.label}</span>
                <span className={cx('block text-xs', method === r.key ? 'text-white/85' : 'text-ink-muted')}>{r.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {method !== 'none' && (
          <Field label="Amount" error={f.refund_cents} hint={chosen.length ? `Up to ${formatKes(max)}: what they paid for these pieces.` : 'Choose the pieces first.'}>
            {(a) => <UnitInput {...a} unit="KES" unitFirst value={refund ?? String(max / 100)} onChange={(e) => setRefund(e.target.value)} />}
          </Field>
        )}
        <Field label="Why did it come back?" error={f.reason}>
          {(a) => <Input {...a} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size for the window" />}
        </Field>
        {problem && !f.reason && !f.refund_cents && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
