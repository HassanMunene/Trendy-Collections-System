import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Approval, Customer, PaymentMethod } from '../api/types'
import { CustomerPicker } from '../components/CustomerPicker'
import { Drawer } from '../components/Drawer'
import { TrashIcon } from '../components/icons'
import { MethodPicker } from '../components/MethodPicker'
import { useToast } from '../components/toast-context'
import { Button, DetailList, EmptyState, ErrorNotice, Field, Input, Loading, Notice, PageHeader, Pill, Select, UnitInput } from '../components/ui'
import { cx } from '../lib/cx'
import { useLinkedId } from '../lib/useLinkedId'
import { CUSTOMERS_KEY, PRODUCTS_KEY, quantityLabel, useProducts } from '../lib/useCatalogue'
import { formatDate, formatDateTime, formatKes, shillingsToCents } from '../lib/units'

const APPROVALS_KEY = ['approvals'] as const

function dueLabel(a: Approval): string {
  if (a.status === 'closed') return `Settled ${formatDate(a.closed_at)}`
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date()) + 'T00:00:00Z')
  const due = new Date(a.due_on + 'T00:00:00Z')
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days} ${days === 1 ? 'day' : 'days'} (${formatDate(a.due_on)})`
}

/** Goods out with neighbouring shops: at most a week, then they come back or are paid for. */
export function ApprovalsPage() {
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [issuing, setIssuing] = useState(false)
  const [approvalId, setApprovalId] = useLinkedId('approval')
  const approvals = useQuery({ queryKey: [...APPROVALS_KEY, status], queryFn: () => api.approvals(status) })
  const list = approvals.data ?? []
  const overdue = list.filter((a) => a.overdue).length
  const linked = useQuery({
    queryKey: [...APPROVALS_KEY, 'one', approvalId],
    queryFn: () => api.approval(approvalId!),
    enabled: approvalId !== null,
    placeholderData: () => list.find((a) => a.id === approvalId),
  })

  return (
    <>
      <PageHeader
        title="On approval"
        subtitle="Goods out with other shops. They may keep them for one week, then bring back what did not sell."
        action={<Button onClick={() => setIssuing(true)}>Send goods out</Button>}
      />

      <div role="tablist" aria-label="Show" className="mb-4 inline-flex rounded-xl bg-blush-100 p-1">
        {(['open', 'closed'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cx('min-h-10 rounded-lg px-4 text-sm font-semibold', status === s ? 'bg-white text-plum shadow-sm' : 'text-ink-muted hover:text-plum')}
          >
            {s === 'open' ? 'Out now' : 'Settled'}
          </button>
        ))}
      </div>

      {status === 'open' && overdue > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {overdue} {overdue === 1 ? 'shop has' : 'shops have'} kept goods for more than a week. Ask them to return them or pay.
          </Notice>
        </div>
      )}

      {approvals.error && <ErrorNotice problem={toProblem(approvals.error)} onRetry={() => approvals.refetch()} />}
      {approvals.isLoading && <Loading />}
      {approvals.data?.length === 0 && (
        <EmptyState title={status === 'open' ? 'Nothing out on approval' : 'Nothing settled yet'} action={status === 'open' ? <Button onClick={() => setIssuing(true)}>Send goods out</Button> : undefined}>
          When a shop like BS 60 takes cases or curtains to try selling, record it here so you know what is out and for how long.
        </EmptyState>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setApprovalId(a.id)}
              className={cx(
                'flex h-full w-full flex-col gap-1 rounded-2xl border bg-white p-4 text-left shadow-card transition hover:bg-blush-50',
                a.overdue ? 'border-danger/50' : 'border-line-soft',
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold text-plum">{a.customer?.name}</span>
                <span className="text-xs text-ink-muted">{a.number}</span>
              </span>
              {a.customer?.stall && <span className="text-xs text-ink-muted">{a.customer.stall}</span>}
              <span className="text-sm text-ink">{a.lines?.filter((l) => a.status === 'closed' || l.outstanding > 0).map((l) => `${a.status === 'closed' ? l.quantity_out : l.outstanding} × ${l.name}`).join(', ')}</span>
              <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                {a.status === 'open' ? <Pill tone={a.overdue ? 'warn' : 'default'}>{dueLabel(a)}</Pill> : <Pill tone="muted">{dueLabel(a)}</Pill>}
                {a.status === 'open' && <span className="tabular text-sm font-semibold text-plum">{a.pieces_out} out · {formatKes(a.value_out_cents)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {issuing && <IssueDrawer onClose={() => setIssuing(false)} />}
      {approvalId !== null && linked.data && <ApprovalDrawer key={approvalId} approval={linked.data} onClose={() => setApprovalId(null)} />}
    </>
  )
}

interface IssueLine {
  productId: string
  quantity: string
  price: string
}

function IssueDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const products = useProducts()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [picking, setPicking] = useState(true)
  const [lines, setLines] = useState<IssueLine[]>([{ productId: '', quantity: '', price: '' }])
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}
  const stocked = (products.data ?? []).filter((p) => p.tracks_stock && p.quantity > 0)
  const update = (i: number, patch: Partial<IssueLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  if (picking) {
    return (
      <CustomerPicker
        onClose={customer ? () => setPicking(false) : onClose}
        onPick={(c) => {
          setCustomer(c)
          setPicking(false)
        }}
      />
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!customer) return
    const errors: Record<string, string> = {}
    const body = lines.map((l, i) => {
      const q = Number(l.quantity)
      const price = l.price.trim() ? shillingsToCents(l.price) : null
      if (!l.productId) errors[`lines.${i}.stock_item_id`] = 'Choose a product.'
      if (!Number.isInteger(q) || q < 1) errors[`lines.${i}.quantity`] = 'How many?'
      if (l.price.trim() && price === null) errors[`lines.${i}.unit_price_cents`] = 'Enter shillings.'
      return { stock_item_id: Number(l.productId), quantity: q, unit_price_cents: price }
    })
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const a = await api.issueApproval({ customer_id: customer.id, note: note.trim(), lines: body })
      qc.invalidateQueries({ queryKey: APPROVALS_KEY })
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${a.number}: ${a.pieces_out} pieces out with ${customer.name} until ${formatDate(a.due_on)}.`)
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
      title="Send goods out on approval"
      description="They come off the shelf now. Due back or paid for within a week."
      size="lg"
      footer={
        <Button type="submit" form="issue-form" busy={busy}>
          Send out
        </Button>
      }
    >
      <form id="issue-form" onSubmit={submit} className="grid gap-5" noValidate>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose/40 bg-blush-50 px-4 py-3">
          <span>
            <span className="block text-xs font-semibold text-ink-muted">Shop</span>
            <span className="font-semibold text-plum">
              {customer?.name}
              {customer?.stall && <span className="font-normal text-ink-muted"> · {customer.stall}</span>}
            </span>
          </span>
          <Button type="button" variant="ghost" onClick={() => setPicking(true)}>
            Change
          </Button>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-display text-lg text-plum">What is going out</legend>
          {lines.map((l, i) => {
            const product = stocked.find((p) => String(p.id) === l.productId)
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_auto]">
                <Field label={i === 0 ? 'Product' : `Product ${i + 1}`} error={f[`lines.${i}.stock_item_id`]}>
                  {(a) => (
                    <Select {...a} value={l.productId} onChange={(e) => update(i, { productId: e.target.value, price: '' })}>
                      <option value="">Choose…</option>
                      {stocked.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.quantity} left)
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="How many" error={f[`lines.${i}.quantity`]}>
                  {(a) => <Input {...a} type="number" inputMode="numeric" min={1} max={product?.quantity} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />}
                </Field>
                <Field label="Price each" error={f[`lines.${i}.unit_price_cents`]} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  {(a) => (
                    <UnitInput {...a} unit="KES" unitFirst value={l.price} placeholder={product?.price_cents ? String(product.price_cents / 100) : ''} onChange={(e) => update(i, { price: e.target.value })} />
                  )}
                </Field>
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="mt-7 grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-blush-100 disabled:opacity-30"
                >
                  <TrashIcon />
                </button>
              </div>
            )
          })}
          <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setLines((ls) => [...ls, { productId: '', quantity: '', price: '' }])}>
            + Another product
          </Button>
          <p className="text-xs text-ink-muted">Price each is what you agreed for any they sell; it defaults to the asking price.</p>
        </fieldset>

        <Field label="Note" hint="Optional">
          {(a) => <Input {...a} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {problem && !Object.keys(f).some((k) => k.startsWith('lines.')) && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}

function ApprovalDrawer({ approval: initial, onClose }: { approval: Approval; onClose: () => void }) {
  const [approval, setApproval] = useState(initial)
  const [settling, setSettling] = useState(false)

  if (settling) {
    return (
      <SettleDrawer
        approval={approval}
        onClose={() => setSettling(false)}
        onSettled={(a) => {
          setApproval(a)
          setSettling(false)
        }}
      />
    )
  }

  return (
    <Drawer
      onClose={onClose}
      title={`${approval.customer?.name} · ${approval.number}`}
      description={dueLabel(approval)}
      footer={approval.status === 'open' ? <Button onClick={() => setSettling(true)}>Goods came back / were sold</Button> : undefined}
    >
      <div className="grid gap-5">
        {approval.overdue && <Notice tone="warn">More than a week has passed. Ask {approval.customer?.name} to return what did not sell or pay for it.</Notice>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-bold tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="py-2 pr-2">Item</th>
                <th className="px-2 py-2 text-right">Out</th>
                <th className="px-2 py-2 text-right">Back</th>
                <th className="px-2 py-2 text-right">Sold</th>
                <th className="py-2 pl-2 text-right">Still out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {approval.lines?.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 pr-2">
                    <span className="font-semibold text-plum">{l.name}</span>
                    {l.unit_price_cents !== null && <span className="block text-xs text-ink-muted">{formatKes(l.unit_price_cents)} each</span>}
                  </td>
                  <td className="tabular px-2 py-2 text-right">{l.quantity_out}</td>
                  <td className="tabular px-2 py-2 text-right">{l.quantity_returned}</td>
                  <td className="tabular px-2 py-2 text-right">{l.quantity_sold}</td>
                  <td className={cx('tabular py-2 pl-2 text-right font-bold', l.outstanding > 0 ? 'text-plum' : 'text-ink-muted')}>{l.outstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DetailList
          items={[
            ['Sent out by', `${approval.created_by?.name ?? ''}, ${formatDateTime(approval.created_at)}`],
            ['Sales from it', approval.sales?.map((s) => `${s.number} (${formatKes(s.total_cents)})`).join(', ') ?? ''],
            ['Note', approval.note],
          ]}
        />
      </div>
    </Drawer>
  )
}

interface SettleLine {
  returned: number
  sold: number
  total: string | null
}

function SettleDrawer({ approval, onClose, onSettled }: { approval: Approval; onClose: () => void; onSettled: (a: Approval) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const out = (approval.lines ?? []).filter((l) => l.outstanding > 0)
  const [lines, setLines] = useState<Record<number, SettleLine>>(() => Object.fromEntries(out.map((l) => [l.id, { returned: 0, sold: 0, total: null }])))
  const [method, setMethod] = useState<PaymentMethod>('account')
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  const update = (id: number, patch: Partial<SettleLine>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }))
  const lineTotal = (id: number) => {
    const l = lines[id]
    const line = out.find((o) => o.id === id)!
    if (l.total !== null) return shillingsToCents(l.total)
    return line.unit_price_cents === null ? null : line.unit_price_cents * l.sold
  }
  const soldTotal = out.reduce((sum, l) => sum + (lines[l.id].sold > 0 ? (lineTotal(l.id) ?? 0) : 0), 0)
  const anySold = out.some((l) => lines[l.id].sold > 0)

  const all = (kind: 'returned' | 'sold') => setLines(Object.fromEntries(out.map((l) => [l.id, { returned: kind === 'returned' ? l.outstanding : 0, sold: kind === 'sold' ? l.outstanding : 0, total: null }])))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errors: Record<string, string> = {}
    out.forEach((l, i) => {
      if (lines[l.id].sold > 0 && lineTotal(l.id) === null) errors[`lines.${i}.total_cents`] = 'Enter the agreed amount.'
    })
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    const body = out
      .map((l) => ({ approval_line_id: l.id, returned: lines[l.id].returned, sold: lines[l.id].sold, total_cents: lines[l.id].sold > 0 ? lineTotal(l.id) : null }))
      .filter((l) => l.returned + l.sold > 0)
    if (body.length === 0) {
      setProblem({ status: 422, message: 'Enter what came back or what was sold.', fields: {} })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const result = await api.settleApproval(approval.id, {
        lines: body,
        payments: anySold && soldTotal > 0 ? [{ method, amount_cents: soldTotal, mpesa_code: code.trim() || null }] : [],
      })
      ;[APPROVALS_KEY, PRODUCTS_KEY, CUSTOMERS_KEY, ['day-book'], ['dashboard']].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      toast.success(
        result.data.status === 'closed'
          ? `${approval.number} is settled.`
          : `${approval.number} updated. ${result.data.pieces_out} still out.`,
      )
      onSettled(result.data)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title="What came back, what was sold?"
      description={`${approval.customer?.name} · ${approval.number}`}
      size="lg"
      footer={
        <Button type="submit" form="settle-form" busy={busy}>
          {anySold ? `Save · sale of ${formatKes(soldTotal)}` : 'Save'}
        </Button>
      }
    >
      <form id="settle-form" onSubmit={submit} className="grid gap-5" noValidate>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => all('returned')}>
            All came back
          </Button>
          <Button type="button" variant="secondary" onClick={() => all('sold')}>
            All were sold
          </Button>
        </div>

        {out.map((l, i) => {
          const s = lines[l.id]
          const left = l.outstanding - s.returned - s.sold
          return (
            <fieldset key={l.id} className="grid gap-3 rounded-2xl border border-line-soft p-3">
              <legend className="px-1 font-semibold text-plum">
                {l.name} <span className="font-normal text-ink-muted">· {quantityLabel(l.outstanding, l.unit)} out</span>
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Counter label="Came back" value={s.returned} max={s.returned + left} onChange={(n) => update(l.id, { returned: n })} />
                <Counter label="Sold" value={s.sold} max={s.sold + left} onChange={(n) => update(l.id, { sold: n, total: null })} />
              </div>
              {s.sold > 0 && (
                <Field label="Agreed amount for the sold pieces" error={f[`lines.${i}.total_cents`]} hint={l.unit_price_cents !== null ? `${formatKes(l.unit_price_cents)} each was agreed.` : undefined}>
                  {(a) => (
                    <UnitInput
                      {...a}
                      unit="KES"
                      unitFirst
                      value={s.total ?? (l.unit_price_cents !== null ? String((l.unit_price_cents * s.sold) / 100) : '')}
                      onChange={(e) => update(l.id, { total: e.target.value })}
                    />
                  )}
                </Field>
              )}
              {left > 0 && <p className="text-xs text-ink-muted">{left} will stay out with them.</p>}
            </fieldset>
          )
        })}

        {anySold && soldTotal > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-plum-700">How are they paying {formatKes(soldTotal)}?</p>
            <MethodPicker methods={['account', 'cash', 'send_money', 'paybill']} value={method} onChange={setMethod} code={code} onCode={setCode} codeError={f['payments.0.mpesa_code']} />
          </div>
        )}
        {problem && !Object.keys(f).some((k) => k.startsWith('lines.') || k.startsWith('payments.0.mpesa')) && <ErrorNotice problem={problem.fields.payments ? { ...problem, message: problem.fields.payments } : problem} />}
      </form>
    </Drawer>
  )
}

function Counter({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-plum-700">{label}</p>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button type="button" aria-label={`${label}: one less`} disabled={value === 0} onClick={() => onChange(value - 1)} className="grid size-11 place-items-center rounded-lg bg-blush-200 text-lg font-bold text-plum disabled:opacity-40">
          −
        </button>
        <span className="tabular w-10 text-center text-lg font-semibold">{value}</span>
        <button type="button" aria-label={`${label}: one more`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid size-11 place-items-center rounded-lg bg-blush-200 text-lg font-bold text-plum disabled:opacity-40">
          +
        </button>
      </div>
    </div>
  )
}
