import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { AccountPayment, Customer, MoneyMethod, NewOrderLine, Order, PaymentMethod, Roll, StockItem } from '../api/types'
import { useCan } from '../auth/useMe'
import { CustomerPicker } from '../components/CustomerPicker'
import { Drawer } from '../components/Drawer'
import { TrashIcon } from '../components/icons'
import { MethodPicker } from '../components/MethodPicker'
import { RollPicker } from '../components/RollPicker'
import { useToast } from '../components/toast-context'
import { Button, DetailList, EmptyState, ErrorNotice, Field, Input, Loading, Notice, PageHeader, Pill, Select, Textarea, UnitInput } from '../components/ui'
import { VoidDrawer } from '../components/VoidDrawer'
import { cx } from '../lib/cx'
import { useLinkedId } from '../lib/useLinkedId'
import { CUSTOMERS_KEY, PRODUCTS_KEY, quantityLabel, useProducts } from '../lib/useCatalogue'
import { formatDate, formatDateTime, formatKes, formatMetres, formatPhone, metresToCm, shillingsToCents } from '../lib/units'

const ORDERS_KEY = ['orders'] as const
type Tab = 'active' | 'ready' | 'done'

const todayInNairobi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const STATUS_TONE: Record<Order['status'], 'default' | 'warn' | 'muted' | 'success'> = {
  taken: 'default',
  in_work: 'default',
  ready: 'success',
  collected: 'muted',
  cancelled: 'muted',
}

function dueLabel(o: Order): string {
  if (o.status === 'collected') return `Collected ${formatDate(o.collected_at)}`
  if (o.status === 'cancelled') return `Cancelled ${formatDate(o.cancelled_at)}`
  if (o.status === 'ready') return `Ready since ${formatDate(o.ready_at)}`
  const days = Math.round((new Date(`${o.due_on}T00:00:00Z`).getTime() - new Date(`${todayInNairobi()}T00:00:00Z`).getTime()) / 86_400_000)
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} late`
  if (days === 0) return 'Due today'
  return `Due ${formatDate(o.due_on)}`
}

/** Made-to-measure jobs: deposit, sewing, ready, collected with the balance. */
export function OrdersPage() {
  const canTake = useCan('sell')
  const [params, setParams] = useSearchParams()
  const tab: Tab = (['active', 'ready', 'done'] as const).find((t) => t === params.get('show')) ?? 'active'
  const setTab = (t: Tab) =>
    setParams((current) => {
      const p = new URLSearchParams(current)
      if (t === 'active') p.delete('show')
      else p.set('show', t)
      return p
    }, { replace: true })
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [orderId, setOrderId] = useLinkedId('order')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const orders = useQuery({ queryKey: [...ORDERS_KEY, tab, q], queryFn: () => api.orders({ status: tab, q }) })
  const list = orders.data ?? []
  const linked = useQuery({
    queryKey: [...ORDERS_KEY, 'one', orderId],
    queryFn: () => api.order(orderId!),
    enabled: orderId !== null,
    placeholderData: () => list.find((o) => o.id === orderId),
  })

  return (
    <>
      <PageHeader
        title="Custom orders"
        subtitle="Made-to-measure jobs: deposit, sewing, ready for collection, balance."
        action={canTake && <Button onClick={() => setCreating(true)}>New order</Button>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Show" className="inline-flex rounded-xl bg-blush-100 p-1">
          {(
            [
              ['active', 'In progress'],
              ['ready', 'Ready to collect'],
              ['done', 'Done'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cx('min-h-10 rounded-lg px-3 text-sm font-semibold whitespace-nowrap', tab === key ? 'bg-white text-plum shadow-sm' : 'text-ink-muted hover:text-plum')}
            >
              {label}
            </button>
          ))}
        </div>
        <Input type="search" placeholder="Customer or order number…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" aria-label="Search orders" />
      </div>

      {orders.error && <ErrorNotice problem={toProblem(orders.error)} onRetry={() => orders.refetch()} />}
      {orders.isLoading && <Loading />}
      {orders.data?.length === 0 && (
        <EmptyState title={q ? 'No order matches' : tab === 'ready' ? 'Nothing waiting for collection' : tab === 'done' ? 'No finished orders yet' : 'No orders in progress'} action={tab === 'active' && canTake && !q ? <Button onClick={() => setCreating(true)}>New order</Button> : undefined}>
          {tab === 'active' && !q ? 'Record made-to-measure jobs here with their deposit, so nobody has to remember the balance.' : undefined}
        </EmptyState>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => setOrderId(o.id)}
              className={cx('flex h-full w-full flex-col gap-1 rounded-2xl border bg-white p-4 text-left shadow-card transition hover:bg-blush-50', o.overdue ? 'border-danger/50' : 'border-line-soft')}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold text-plum">{o.customer?.name}</span>
                <span className="text-xs text-ink-muted">{o.number}</span>
              </span>
              <span className="line-clamp-2 text-sm text-ink">{o.lines?.map((l) => l.description).join(', ')}</span>
              <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="flex items-center gap-1.5">
                  <Pill tone={STATUS_TONE[o.status]}>{o.status_label}</Pill>
                  <span className={cx('text-xs', o.overdue ? 'font-bold text-danger' : 'text-ink-muted')}>{dueLabel(o)}</span>
                </span>
                <span className="tabular text-sm">
                  {o.balance_cents > 0 ? <span className="font-semibold text-amber-800">Balance {formatKes(o.balance_cents)}</span> : <span className="text-ink-muted">{formatKes(o.total_cents)}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {creating && (
        <NewOrderDrawer
          onClose={() => setCreating(false)}
          onCreated={(o) => {
            setCreating(false)
            setOrderId(o.id)
          }}
        />
      )}
      {orderId !== null && linked.data && <OrderDrawer key={orderId} order={linked.data} onClose={() => setOrderId(null)} />}
      {orderId !== null && linked.error && (
        <div className="mt-4">
          <ErrorNotice problem={toProblem(linked.error)} />
        </div>
      )}
    </>
  )
}

type DraftLine =
  | { key: number; kind: 'fabric'; roll: Roll; metres: string; amount: string; note: string }
  | { key: number; kind: 'product'; productId: string; quantity: string; amount: string }
  | { key: number; kind: 'work'; description: string; amount: string }

let seq = 0

function NewOrderDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (o: Order) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const products = useProducts()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [step, setStep] = useState<'customer' | 'roll' | 'form'>('customer')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [dueOn, setDueOn] = useState(addDays(todayInNairobi(), 7))
  const [note, setNote] = useState('')
  const [deposit, setDeposit] = useState('')
  const [method, setMethod] = useState<MoneyMethod>('cash')
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  const update = (key: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? ({ ...l, ...patch } as DraftLine) : l)))
  const total = lines.reduce((sum, l) => sum + (shillingsToCents(l.amount) ?? 0), 0)
  const depositCents = deposit.trim() ? shillingsToCents(deposit) : 0

  if (step === 'customer') {
    return (
      <CustomerPicker
        onClose={customer ? () => setStep('form') : onClose}
        onPick={(c) => {
          setCustomer(c)
          setStep('form')
        }}
      />
    )
  }
  if (step === 'roll') {
    return (
      <Drawer onClose={() => setStep('form')} title="Fabric from which roll?">
        <RollPicker
          onPick={(roll) => {
            setLines((ls) => [...ls, { key: ++seq, kind: 'fabric', roll, metres: '', amount: '', note: '' }])
            setStep('form')
          }}
        />
      </Drawer>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!customer) return
    const errors: Record<string, string> = {}
    const body: NewOrderLine[] = lines.map((l, i) => {
      const amount = shillingsToCents(l.amount)
      if (amount === null || l.amount.trim() === '') errors[`lines.${i}.total_cents`] = 'Enter the price for this line.'
      if (l.kind === 'fabric') {
        const cm = metresToCm(l.metres)
        if (cm === null || cm <= 0) errors[`lines.${i}.length_cm`] = 'Metres?'
        return { kind: 'fabric', roll_id: l.roll.id, length_cm: cm ?? 0, total_cents: amount ?? 0, description: l.note.trim() || undefined }
      }
      if (l.kind === 'product') {
        const q = Number(l.quantity)
        if (!l.productId) errors[`lines.${i}.stock_item_id`] = 'Choose a product.'
        if (!Number.isInteger(q) || q < 1) errors[`lines.${i}.quantity`] = 'How many?'
        return { kind: 'product', stock_item_id: Number(l.productId), quantity: q, total_cents: amount ?? 0 }
      }
      if (!l.description.trim()) errors[`lines.${i}.description`] = 'Describe the work.'
      return { kind: 'work', description: l.description.trim(), total_cents: amount ?? 0 }
    })
    if (lines.length === 0) errors.lines = 'Add what the customer ordered.'
    if (depositCents === null) errors['deposit.amount_cents'] = 'Enter the deposit in shillings.'
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: errors.lines ?? 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const order = await api.createOrder({
        customer_id: customer.id,
        due_on: dueOn,
        note: note.trim(),
        lines: body,
        deposit: depositCents ? { method, amount_cents: depositCents, mpesa_code: code.trim() || null } : null,
      })
      ;[ORDERS_KEY, ['day-book'], ['dashboard'], CUSTOMERS_KEY].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      toast.success(`Order ${order.number} taken${order.paid_cents ? ` with ${formatKes(order.paid_cents)} deposit` : ''}. Balance ${formatKes(order.balance_cents)}.`)
      onCreated(order)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title="New custom order"
      size="lg"
      footer={
        <Button type="submit" form="order-form" busy={busy}>
          Take order · {formatKes(total)}
        </Button>
      }
    >
      <form id="order-form" onSubmit={submit} className="grid gap-5" noValidate>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose/40 bg-blush-50 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-ink-muted">Customer</span>
            <span className="font-semibold text-plum">{customer?.name}</span>
            <span className="block text-xs text-ink-muted">{customer?.phone ? formatPhone(customer.phone) : 'No phone saved: add one so you can call when it is ready.'}</span>
          </span>
          <Button type="button" variant="ghost" onClick={() => setStep('customer')}>
            Change
          </Button>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-display text-lg text-plum">What did they order?</legend>
          {lines.map((l, i) => (
            <div key={l.key} className="grid gap-2 rounded-2xl border border-line-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-plum">
                  {l.kind === 'fabric' ? `${l.roll.fabric?.display_name ?? 'Fabric'} · roll ${l.roll.tag} (${formatMetres(l.roll.balance_cm)} left)` : l.kind === 'product' ? 'Product' : 'Work'}
                </p>
                <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-blush-100">
                  <TrashIcon />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
                {l.kind === 'fabric' && (
                  <>
                    <Field label="For" className="col-span-2 sm:col-span-1">
                      {(a) => <Input {...a} value={l.note} onChange={(e) => update(l.key, { note: e.target.value })} placeholder="e.g. Sitting room" />}
                    </Field>
                    <Field label="Metres" error={f[`lines.${i}.length_cm`]}>
                      {(a) => (
                        <UnitInput
                          {...a}
                          unit="m"
                          value={l.metres}
                          onChange={(e) => {
                            // Suggest the price from the fabric's price per metre; staff can change it.
                            const cm = metresToCm(e.target.value)
                            const perM = l.roll.fabric?.retail_price_cents_per_m
                            update(l.key, perM && cm !== null ? { metres: e.target.value, amount: String(Math.round((perM * cm) / 100) / 100) } : { metres: e.target.value })
                          }}
                        />
                      )}
                    </Field>
                  </>
                )}
                {l.kind === 'product' && (
                  <>
                    <Field label="Which" error={f[`lines.${i}.stock_item_id`]} className="col-span-2 sm:col-span-1">
                      {(a) => (
                        <Select
                          {...a}
                          value={l.productId}
                          onChange={(e) => {
                            const p = products.data?.find((x) => String(x.id) === e.target.value)
                            update(l.key, { productId: e.target.value, amount: p?.price_cents ? String((p.price_cents * (Number(l.quantity) || 1)) / 100) : l.amount })
                          }}
                        >
                          <option value="">Choose…</option>
                          {products.data?.map((p: StockItem) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.tracks_stock ? ` (${p.quantity} left)` : ''}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="How many" error={f[`lines.${i}.quantity`]}>
                      {(a) => <Input {...a} type="number" inputMode="numeric" min={1} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />}
                    </Field>
                  </>
                )}
                {l.kind === 'work' && (
                  <Field label="Work" error={f[`lines.${i}.description`]} className="col-span-2">
                    {(a) => <Input {...a} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="e.g. Sewing 3 window sets, 2.6 m drop · Delivery & fitting" />}
                  </Field>
                )}
                <Field label="Price" error={f[`lines.${i}.total_cents`]}>
                  {(a) => <UnitInput {...a} unit="KES" unitFirst value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} />}
                </Field>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep('roll')}>
              + Fabric from a roll
            </Button>
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { key: ++seq, kind: 'product', productId: '', quantity: '1', amount: '' }])}>
              + Product
            </Button>
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { key: ++seq, kind: 'work', description: '', amount: '' }])}>
              + Work (sewing, fitting…)
            </Button>
          </div>
          {f.lines && <p className="text-sm font-medium text-danger">{f.lines}</p>}
        </fieldset>

        <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
          <span className="font-semibold text-ink-muted">Order total</span>
          <span className="tabular font-display text-3xl text-plum">{formatKes(total)}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ready by" error={f.due_on}>
            {(a) => <Input {...a} type="date" min={todayInNairobi()} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />}
          </Field>
          <Field label="Deposit paid now" error={f['deposit.amount_cents']} hint={total && depositCents ? `Balance at collection: ${formatKes(total - depositCents)}` : 'Optional'}>
            {(a) => <UnitInput {...a} unit="KES" unitFirst value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="e.g. 15,000" />}
          </Field>
        </div>
        {depositCents ? <MethodPicker methods={['cash', 'send_money', 'paybill']} value={method} onChange={setMethod} code={code} onCode={setCode} codeError={f['deposit.mpesa_code']} /> : null}

        <Field label="Measurements and notes" hint="Optional: window sizes, style, lining…">
          {(a) => <Textarea {...a} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>

        {problem && !Object.keys(f).length && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}

type Action = 'pay' | 'collect' | 'cancel' | { void: AccountPayment } | null

function OrderDrawer({ order: initial, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const canTake = useCan('sell')
  const canSew = useCan('record_sewing')
  const canVoid = useCan('void_sales')
  const [order, setOrder] = useState(initial)
  const [action, setAction] = useState<Action>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const active = ['taken', 'in_work', 'ready'].includes(order.status)

  const refreshAll = () => [ORDERS_KEY, PRODUCTS_KEY, ['rolls'], ['day-book'], ['dashboard'], CUSTOMERS_KEY].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  const done = (o: Order, message: string) => {
    setOrder(o)
    setAction(null)
    refreshAll()
    toast.success(message)
  }

  async function move(to: 'start' | 'ready') {
    setBusy(true)
    setProblem(null)
    try {
      const o = to === 'start' ? await api.startOrder(order.id) : await api.readyOrder(order.id)
      done(o, to === 'start' ? `${o.number}: work started, fabric cut from the rolls.` : `${o.number} is ready. Call ${o.customer?.name}${o.customer?.phone ? ` on ${formatPhone(o.customer.phone)}` : ''}.`)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  if (action === 'pay' || action === 'collect') {
    return <OrderPaymentDrawer order={order} collect={action === 'collect'} onClose={() => setAction(null)} onDone={(o) => done(o, action === 'collect' ? `${o.number} collected.` : `Payment recorded. Balance ${formatKes(o.balance_cents)}.`)} />
  }
  if (action === 'cancel') {
    return <CancelOrderDrawer order={order} onClose={() => setAction(null)} onDone={(o) => done(o, `${o.number} cancelled.`)} />
  }
  if (action && typeof action === 'object') {
    return (
      <VoidDrawer
        title="Void this payment?"
        description={`${order.number} · ${formatKes(action.void.amount_cents)}`}
        explanation="It stops counting towards the order and the balance goes back up. It stays on record, crossed out, with your name and reason."
        onClose={() => setAction(null)}
        onVoid={async (reason) => {
          await api.voidAccountPayment(action.void.id, reason)
          done(await api.order(order.id), 'Payment voided.')
        }}
      />
    )
  }

  return (
    <Drawer
      onClose={onClose}
      title={`${order.customer?.name} · ${order.number}`}
      description={`${order.status_label} · ${dueLabel(order)}`}
      size="lg"
      footer={
        active ? (
          <>
            {canVoid && (
              <Button variant="ghost" onClick={() => setAction('cancel')}>
                Cancel order
              </Button>
            )}
            {canTake && order.balance_cents > 0 && (
              <Button variant="secondary" onClick={() => setAction('pay')}>
                Record payment
              </Button>
            )}
            {(canTake || canSew) && order.status === 'taken' && (
              <Button variant="secondary" busy={busy} onClick={() => move('start')}>
                Start work
              </Button>
            )}
            {(canTake || canSew) && order.status !== 'ready' && (
              <Button busy={busy} onClick={() => move('ready')}>
                Mark ready
              </Button>
            )}
            {canTake && order.status === 'ready' && <Button onClick={() => setAction('collect')}>Collected · take {formatKes(order.balance_cents)}</Button>}
          </>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        {problem && <ErrorNotice problem={problem} />}
        {order.overdue && <Notice tone="warn">This order was due on {formatDate(order.due_on)}.</Notice>}
        {order.status === 'cancelled' && (
          <Notice tone="warn">
            Cancelled by {order.cancelled_by?.name} on {formatDateTime(order.cancelled_at)}: {order.cancel_reason}
            {order.refund_cents > 0 && `. ${formatKes(order.refund_cents)} given back.`}
          </Notice>
        )}

        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Progress">
          {[
            ['Taken', order.created_at],
            ['In work', order.started_at],
            ['Ready', order.ready_at],
            ['Collected', order.collected_at],
          ].map(([label, at]) => (
            <li key={label} className={cx('flex items-center gap-1.5', at ? 'font-semibold text-plum' : 'text-ink-faint')}>
              <span className={cx('size-2.5 rounded-full', at ? 'bg-rose' : 'bg-line')} aria-hidden />
              {label}
              {at && <span className="font-normal text-ink-muted">{formatDate(at)}</span>}
            </li>
          ))}
        </ol>

        <ul className="divide-y divide-line-soft">
          {order.lines?.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-plum">{l.description}</span>
                <span className="text-sm text-ink-muted">{l.kind === 'fabric' ? formatMetres(l.length_cm) : l.kind === 'product' ? quantityLabel(l.quantity ?? 0, 'pcs') : 'Work'}</span>
              </span>
              <span className="tabular font-semibold">{formatKes(l.total_cents)}</span>
            </li>
          ))}
        </ul>

        <section className="rounded-2xl bg-blush-50 p-4">
          <DetailList
            items={[
              ['Order total', formatKes(order.total_cents)],
              ['Paid so far', formatKes(order.paid_cents)],
            ]}
          />
          <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="font-semibold text-plum">Balance</span>
            <span className={cx('tabular font-display text-2xl', order.balance_cents > 0 ? 'text-amber-800' : 'text-success')}>{formatKes(order.balance_cents)}</span>
          </div>
        </section>

        {(order.payments?.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-2 font-display text-lg text-plum">Payments</h3>
            <ul className="divide-y divide-line-soft">
              {order.payments?.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!canVoid || p.voided || !active}
                    onClick={() => setAction({ void: p })}
                    className={cx('flex w-full justify-between gap-2 py-2 text-left text-sm enabled:hover:bg-blush-50', p.voided && 'text-ink-muted line-through')}
                  >
                    <span>
                      <span className="font-semibold text-plum">{formatDateTime(p.created_at)}</span>
                      <span className="block text-xs text-ink-muted">
                        {p.method_label}
                        {p.mpesa_code && ` · ${p.mpesa_code}`} · {p.received_by?.name}
                        {p.voided && ` · voided: ${p.void_reason}`}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{formatKes(p.amount_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DetailList
          items={[
            ['Phone', formatPhone(order.customer?.phone)],
            ['Taken by', `${order.created_by?.name ?? ''}, ${formatDateTime(order.created_at)}`],
            ['Notes', order.note],
          ]}
        />
      </div>
    </Drawer>
  )
}

function OrderPaymentDrawer({ order, collect, onClose, onDone }: { order: Order; collect: boolean; onClose: () => void; onDone: (o: Order) => void }) {
  const [amount, setAmount] = useState(String(order.balance_cents / 100))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = collect ? order.balance_cents : shillingsToCents(amount)
    if (cents === null || (!collect && cents <= 0)) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { amount_cents: 'Enter the amount paid.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const o = collect
        ? await api.collectOrder(order.id, cents > 0 ? [{ method, amount_cents: cents, mpesa_code: code.trim() || null }] : [])
        : await api.payOrder(order.id, { method: method as MoneyMethod, amount_cents: cents, mpesa_code: code.trim() || null })
      onDone(o)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={collect ? 'Customer is collecting' : 'Record a payment'}
      description={`${order.customer?.name} · ${order.number} · balance ${formatKes(order.balance_cents)}`}
      footer={
        <Button type="submit" form="order-payment-form" busy={busy}>
          {collect ? (order.balance_cents > 0 ? `Collected · ${formatKes(order.balance_cents)} paid` : 'Collected') : 'Save payment'}
        </Button>
      }
    >
      <form id="order-payment-form" onSubmit={submit} className="grid gap-4" noValidate>
        {collect ? (
          <Notice>{order.balance_cents > 0 ? `They pay the balance of ${formatKes(order.balance_cents)} now, or it goes on their "to pay".` : 'Fully paid. Any products on the order come off the shelf now.'}</Notice>
        ) : (
          <Field label="Amount" error={f.amount_cents} hint="Part payments are fine.">
            {(a) => <UnitInput {...a} unit="KES" unitFirst value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />}
          </Field>
        )}
        {(!collect || order.balance_cents > 0) && (
          <MethodPicker
            methods={collect ? ['cash', 'send_money', 'paybill', 'account'] : ['cash', 'send_money', 'paybill']}
            value={method}
            onChange={setMethod}
            code={code}
            onCode={setCode}
            codeError={f.mpesa_code ?? f['payments.0.mpesa_code']}
          />
        )}
        {problem && !f.amount_cents && !f.mpesa_code && !f['payments.0.mpesa_code'] && <ErrorNotice problem={problem.fields.payments ? { ...problem, message: problem.fields.payments } : problem} />}
      </form>
    </Drawer>
  )
}

function CancelOrderDrawer({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (o: Order) => void }) {
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState('')
  const [method, setMethod] = useState<MoneyMethod>('cash')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = refund.trim() ? shillingsToCents(refund) : 0
    const errors: Record<string, string> = {}
    if (!reason.trim()) errors.reason = 'Say why the order is cancelled.'
    if (cents === null) errors.refund_cents = 'Enter shillings, or leave empty.'
    if (Object.keys(errors).length || cents === null) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      onDone(await api.cancelOrder(order.id, { reason: reason.trim(), refund_cents: cents, refund_method: cents > 0 ? method : null }))
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={`Cancel ${order.number}?`}
      description={`${order.customer?.name} · paid ${formatKes(order.paid_cents)}`}
      footer={
        <Button type="submit" form="cancel-order-form" variant="danger" busy={busy}>
          Cancel order
        </Button>
      }
    >
      <form id="cancel-order-form" onSubmit={submit} className="grid gap-4" noValidate>
        {order.started_at && <Notice tone="warn">The fabric was already cut on {formatDate(order.started_at)}; it stays off the roll.</Notice>}
        <Field label="Why?" error={f.reason}>
          {(a) => <Input {...a} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed her mind" />}
        </Field>
        {order.paid_cents > 0 && (
          <>
            <Field label="Money given back" error={f.refund_cents} hint={`Up to ${formatKes(order.paid_cents)}. Leave empty if the shop keeps the deposit.`}>
              {(a) => <UnitInput {...a} unit="KES" unitFirst value={refund} onChange={(e) => setRefund(e.target.value)} />}
            </Field>
            {refund.trim() && shillingsToCents(refund) ? <MethodPicker methods={['cash', 'send_money', 'paybill']} value={method} onChange={setMethod} /> : null}
          </>
        )}
        {problem && !f.reason && !f.refund_cents && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
