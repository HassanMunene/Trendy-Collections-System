import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Customer, PaymentMethod, Roll, Sale, SaleBody, StockItem } from '../api/types'
import { CustomerPicker } from '../components/CustomerPicker'
import { Drawer } from '../components/Drawer'
import { CartIcon, MinusIcon, PlusGlyphIcon, TrashIcon, XMarkIcon } from '../components/icons'
import { RollPicker } from '../components/RollPicker'
import { useToast } from '../components/toast-context'
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Notice, Pill, Swatch, UnitInput } from '../components/ui'
import { cx } from '../lib/cx'
import { PAYMENT_METHODS } from '../lib/payments'
import { CUSTOMERS_KEY, PRODUCTS_KEY, quantityLabel, useProductCategories, useProducts } from '../lib/useCatalogue'
import { cmToMetreInput, formatDate, formatKes, formatMetres, metresToCm, shillingsToCents } from '../lib/units'
import { CategoryChip } from './ProductsPage'

type BasketLine =
  | { key: string; kind: 'product'; product: StockItem; quantity: number; amountCents: number }
  | { key: string; kind: 'fabric'; roll: Roll; lengthCm: number; amountCents: number }

interface PaymentDraft {
  method: PaymentMethod
  amount: string
  code: string
}

type Editing = { kind: 'product'; product: StockItem; line?: BasketLine } | { kind: 'fabric'; roll: Roll; line?: BasketLine } | null

let lineSeq = 0

/** The counter: build one customer's basket, agree prices, take payment. Replaces a page of the sales book. */
export function SellPage() {
  const products = useProducts()
  const categories = useProductCategories()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [walkInName, setWalkInName] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [pickingRoll, setPickingRoll] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [recorded, setRecorded] = useState<Sale | null>(null)

  const total = basket.reduce((sum, l) => sum + l.amountCents, 0)

  // Stock already in the basket, so the picker shows what is really left.
  const inBasket = useMemo(() => {
    const m = new Map<number, number>()
    for (const l of basket) if (l.kind === 'product') m.set(l.product.id, (m.get(l.product.id) ?? 0) + l.quantity)
    return m
  }, [basket])

  const visible = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return (products.data ?? []).filter(
      (p) => (categoryId === null || p.category?.id === categoryId) && words.every((w) => p.name.toLowerCase().includes(w)),
    )
  }, [products.data, categoryId, search])

  const saveLine = (line: BasketLine) => {
    setBasket((b) => (b.some((l) => l.key === line.key) ? b.map((l) => (l.key === line.key ? line : l)) : [...b, line]))
    setEditing(null)
  }

  const reset = () => {
    setBasket([])
    setCustomer(null)
    setWalkInName('')
    setCheckout(false)
  }

  return (
    <div className="pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:pb-0">
      <div className="min-w-0">
        <div className="pt-5 pb-3 sm:pt-7">
          <CustomerBar
            customer={customer}
            walkInName={walkInName}
            onWalkInName={setWalkInName}
            onPick={() => setPickingCustomer(true)}
            onClear={() => setCustomer(null)}
          />
        </div>

        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
            All
          </CategoryChip>
          {categories.data?.map((c) => (
            <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </CategoryChip>
          ))}
          <CategoryChip active={false} onClick={() => setPickingRoll(true)}>
            Fabric by the metre
          </CategoryChip>
        </div>

        <Input type="search" placeholder="Search colour or type, e.g. grey blackout" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" aria-label="Search products" />

        {products.error && <ErrorNotice problem={toProblem(products.error)} onRetry={() => products.refetch()} />}
        {products.isLoading && <Loading />}
        {products.data?.length === 0 && (
          <EmptyState title="Nothing to sell yet">Add the shop's curtains, sheers, cases and rods under Products first.</EmptyState>
        )}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => {
            const left = p.quantity - (inBasket.get(p.id) ?? 0)
            const out = p.tracks_stock && left <= 0
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={out}
                  onClick={() => setEditing({ kind: 'product', product: p })}
                  className={cx(
                    'flex h-full min-h-24 w-full flex-col gap-1 rounded-xl border bg-white p-3 text-left shadow-card transition active:scale-[0.98]',
                    out ? 'border-line-soft opacity-50' : 'border-line-soft hover:border-rose',
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                    <Swatch name={p.colour?.name} />
                    <span className="truncate">{p.category?.name}</span>
                  </span>
                  <span className="line-clamp-2 font-semibold leading-snug text-plum">{[p.colour?.name, p.variant].filter(Boolean).join(' · ') || p.name}</span>
                  <span className="mt-auto flex items-end justify-between gap-1 text-sm">
                    <span className="tabular text-ink">{p.price_cents === null ? '—' : formatKes(p.price_cents)}</span>
                    <span className={cx('tabular text-xs', out ? 'font-bold text-danger' : 'text-ink-muted')}>{p.tracks_stock ? (out ? 'None left' : `${left} left`) : ''}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Laptop: basket stays beside the products. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 pt-7">
          <BasketPanel basket={basket} total={total} onEdit={(l) => setEditing(l.kind === 'product' ? { kind: 'product', product: l.product, line: l } : { kind: 'fabric', roll: l.roll, line: l })} onRemove={(key) => setBasket((b) => b.filter((l) => l.key !== key))} onCheckout={() => setCheckout(true)} />
        </div>
      </aside>

      {/* Phone: basket bar in thumb reach, above the tabs. */}
      {basket.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line-soft bg-white/95 px-4 py-3 shadow-[0_-4px_18px_#3517231a] backdrop-blur md:bottom-0 lg:hidden">
          <Button className="w-full justify-between" onClick={() => setCheckout(true)}>
            <span className="inline-flex items-center gap-2">
              <CartIcon size={20} />
              {basket.length} {basket.length === 1 ? 'item' : 'items'}
            </span>
            <span className="tabular">{formatKes(total)} · Pay</span>
          </Button>
        </div>
      )}

      {checkout && (
        <CheckoutDrawer
          basket={basket}
          total={total}
          customer={customer}
          walkInName={walkInName}
          onEdit={(l) => setEditing(l.kind === 'product' ? { kind: 'product', product: l.product, line: l } : { kind: 'fabric', roll: l.roll, line: l })}
          onRemove={(key) => setBasket((b) => b.filter((l) => l.key !== key))}
          onPickCustomer={() => setPickingCustomer(true)}
          onClose={() => setCheckout(false)}
          onRecorded={(sale) => {
            setRecorded(sale)
            reset()
          }}
        />
      )}
      {editing?.kind === 'product' && (
        <ProductLineEditor
          product={editing.product}
          line={editing.line?.kind === 'product' ? editing.line : undefined}
          available={editing.product.quantity - (inBasket.get(editing.product.id) ?? 0) + (editing.line?.kind === 'product' ? editing.line.quantity : 0)}
          customer={customer}
          onSave={saveLine}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'fabric' && (
        <FabricLineEditor roll={editing.roll} line={editing.line?.kind === 'fabric' ? editing.line : undefined} onSave={saveLine} onClose={() => setEditing(null)} />
      )}
      {pickingRoll && (
        <Drawer onClose={() => setPickingRoll(false)} title="Fabric by the metre" description="Pick the roll the fabric is cut from.">
          <RollPicker
            onPick={(roll) => {
              setPickingRoll(false)
              setEditing({ kind: 'fabric', roll })
            }}
          />
        </Drawer>
      )}
      {pickingCustomer && (
        <CustomerPicker
          onClose={() => setPickingCustomer(false)}
          onPick={(c) => {
            setCustomer(c)
            setPickingCustomer(false)
          }}
        />
      )}
      {recorded && <ReceiptDrawer sale={recorded} onClose={() => setRecorded(null)} />}
    </div>
  )
}

function CustomerBar({
  customer,
  walkInName,
  onWalkInName,
  onPick,
  onClear,
}: {
  customer: Customer | null
  walkInName: string
  onWalkInName: (v: string) => void
  onPick: () => void
  onClear: () => void
}) {
  if (customer) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rose/40 bg-blush-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-muted">Customer</p>
          <p className="truncate font-semibold text-plum">
            {customer.name}
            {customer.stall && <span className="font-normal text-ink-muted"> · {customer.stall}</span>}
          </p>
          {customer.owed_cents > 0 && <p className="text-xs font-semibold text-amber-800">Already owes {formatKes(customer.owed_cents)}</p>}
        </div>
        <button type="button" onClick={onClear} aria-label="Back to walk-in" className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-blush-200">
          <XMarkIcon className="size-5" />
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <Input placeholder="Walk-in (name optional)" value={walkInName} onChange={(e) => onWalkInName(e.target.value)} aria-label="Walk-in customer name" maxLength={80} />
      <Button variant="secondary" onClick={onPick} className="flex-none">
        Customer…
      </Button>
    </div>
  )
}

function BasketPanel({
  basket,
  total,
  onEdit,
  onRemove,
  onCheckout,
}: {
  basket: BasketLine[]
  total: number
  onEdit: (l: BasketLine) => void
  onRemove: (key: string) => void
  onCheckout?: () => void
}) {
  return (
    <section className="rounded-2xl border border-line-soft bg-white p-4 shadow-card">
      <h2 className="mb-2 font-display text-xl text-plum">Basket</h2>
      {basket.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Tap a product to add it.</p>
      ) : (
        <BasketLines basket={basket} onEdit={onEdit} onRemove={onRemove} />
      )}
      <div className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-3">
        <span className="font-semibold text-ink-muted">Total</span>
        <span className="tabular font-display text-2xl text-plum">{formatKes(total)}</span>
      </div>
      {onCheckout && (
        <Button className="mt-3 w-full" disabled={basket.length === 0} onClick={onCheckout}>
          Take payment
        </Button>
      )}
    </section>
  )
}

function BasketLines({ basket, onEdit, onRemove }: { basket: BasketLine[]; onEdit: (l: BasketLine) => void; onRemove: (key: string) => void }) {
  return (
    <ul className="divide-y divide-line-soft">
      {basket.map((l) => (
        <li key={l.key} className="flex items-center gap-2 py-2">
          <button type="button" onClick={() => onEdit(l)} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold text-plum">{l.kind === 'product' ? l.product.name : (l.roll.fabric?.display_name ?? l.roll.tag)}</span>
            <span className="block text-sm text-ink-muted">
              {l.kind === 'product' ? quantityLabel(l.quantity, l.product.unit) : `${formatMetres(l.lengthCm)} from roll ${l.roll.tag}`}
            </span>
          </button>
          <span className="tabular font-semibold">{formatKes(l.amountCents)}</span>
          <button type="button" onClick={() => onRemove(l.key)} aria-label="Remove" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-blush-100 hover:text-danger">
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max?: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="grid grid-cols-[3rem_6rem_3rem] items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-label="One less" disabled={value <= min} onClick={() => onChange(value - 1)} className="grid size-12 place-items-center rounded-xl bg-blush-200 text-plum disabled:opacity-40">
        <MinusIcon />
      </button>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max ?? Infinity, Math.floor(Number(e.target.value) || min))))}
        className="tabular text-center text-lg font-semibold"
        aria-label={label}
      />
      <button type="button" aria-label="One more" disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)} className="grid size-12 place-items-center rounded-xl bg-blush-200 text-plum disabled:opacity-40">
        <PlusGlyphIcon />
      </button>
    </div>
  )
}

function ProductLineEditor({
  product,
  line,
  available,
  customer,
  onSave,
  onClose,
}: {
  product: StockItem
  line?: Extract<BasketLine, { kind: 'product' }>
  available: number
  customer: Customer | null
  onSave: (l: BasketLine) => void
  onClose: () => void
}) {
  const [quantity, setQuantity] = useState(line?.quantity ?? 1)
  const [amount, setAmount] = useState(line ? String(line.amountCents / 100) : '')
  const [touched, setTouched] = useState(Boolean(line))
  const [error, setError] = useState<string>()
  const max = product.tracks_stock ? available : undefined

  const asking = product.price_cents === null ? null : product.price_cents * quantity
  const shown = touched ? amount : asking === null ? '' : String(asking / 100)

  const hint = useQuery({
    queryKey: ['price-hint', product.id, customer?.id ?? null],
    queryFn: () => api.priceHint(product.id, customer?.id),
    staleTime: 60 * 1000,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = shillingsToCents(shown)
    if (cents === null || shown.trim() === '') {
      setError('Enter the agreed amount for this line, e.g. 2,200')
      return
    }
    onSave({ key: line?.key ?? `l${++lineSeq}`, kind: 'product', product, quantity, amountCents: cents })
  }

  const below = asking !== null && shillingsToCents(shown) !== null ? asking - (shillingsToCents(shown) ?? 0) : 0

  return (
    <Drawer
      onClose={onClose}
      title={[product.colour?.name, product.variant].filter(Boolean).join(' · ') || product.name}
      description={`${product.category?.name ?? ''}${product.tracks_stock ? ` · ${quantityLabel(available, product.unit)} available` : ''}`}
      footer={
        <Button type="submit" form="line-form">
          {line ? 'Update basket' : 'Add to basket'}
        </Button>
      }
    >
      <form id="line-form" onSubmit={submit} className="grid gap-5" noValidate>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-plum-700">How many {product.unit === 'set' ? 'windows (sets)' : product.unit === 'piece' && product.category?.name === 'Door curtain' ? 'doors' : product.unit}?</p>
          <Stepper value={quantity} min={1} max={max} onChange={setQuantity} label="Quantity" />
        </div>
        <Field
          label="Agreed amount for this line"
          error={error}
          hint={asking === null ? 'No asking price set; type what was agreed.' : `Asking ${formatKes(asking)}${quantity > 1 ? ` (${formatKes(product.price_cents)} each)` : ''}.`}
        >
          {(a) => (
            <UnitInput
              {...a}
              unit="KES"
              unitFirst
              value={shown}
              onChange={(e) => {
                setTouched(true)
                setAmount(e.target.value)
              }}
              onFocus={(e) => e.target.select()}
            />
          )}
        </Field>
        {below > 0 && <p className="-mt-3 text-sm text-amber-800">{formatKes(below)} below asking.</p>}

        {hint.data && (hint.data.customer_last || hint.data.recent.length > 0) && (
          <div className="rounded-xl bg-blush-50 p-3 text-sm">
            {hint.data.customer_last && (
              <p className="font-semibold text-plum">
                {hint.data.customer} paid {formatKes(hint.data.customer_last.unit_cents)} each last time ({formatDate(hint.data.customer_last.sold_at)}).
              </p>
            )}
            {hint.data.recent.length > 0 && (
              <p className="mt-1 text-ink-muted">
                Recent prices: {hint.data.recent.map((r) => formatKes(r.unit_cents).replace('KES ', '')).join(', ')}
              </p>
            )}
          </div>
        )}
      </form>
    </Drawer>
  )
}

function FabricLineEditor({ roll, line, onSave, onClose }: { roll: Roll; line?: Extract<BasketLine, { kind: 'fabric' }>; onSave: (l: BasketLine) => void; onClose: () => void }) {
  const [metres, setMetres] = useState(line ? cmToMetreInput(line.lengthCm) : '')
  const [amount, setAmount] = useState(line ? String(line.amountCents / 100) : '')
  const [touched, setTouched] = useState(Boolean(line))
  const [problem, setProblem] = useState<Record<string, string>>({})
  const perMetre = roll.fabric?.retail_price_cents_per_m ?? null
  const cm = metresToCm(metres)
  const asking = perMetre !== null && cm !== null ? Math.round((perMetre * cm) / 100) : null
  const shown = touched ? amount : asking === null ? '' : String(asking / 100)

  function submit(e: FormEvent) {
    e.preventDefault()
    const errors: Record<string, string> = {}
    const cents = shillingsToCents(shown)
    if (cm === null || cm <= 0) errors.metres = 'Enter the length, e.g. 2.5'
    else if (cm > roll.balance_cm) errors.metres = `Roll ${roll.tag} only has ${formatMetres(roll.balance_cm)}.`
    if (cents === null || shown.trim() === '') errors.amount = 'Enter the agreed amount.'
    setProblem(errors)
    if (Object.keys(errors).length || cm === null || cents === null) return
    onSave({ key: line?.key ?? `l${++lineSeq}`, kind: 'fabric', roll, lengthCm: cm, amountCents: cents })
  }

  return (
    <Drawer
      onClose={onClose}
      title={roll.fabric?.display_name ?? `Roll ${roll.tag}`}
      description={`Roll ${roll.tag} · ${formatMetres(roll.balance_cm)} left`}
      footer={
        <Button type="submit" form="fabric-line-form">
          {line ? 'Update basket' : 'Add to basket'}
        </Button>
      }
    >
      <form id="fabric-line-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Length" error={problem.metres}>
          {(a) => <UnitInput {...a} unit="m" autoFocus value={metres} onChange={(e) => setMetres(e.target.value)} placeholder="e.g. 2.5" />}
        </Field>
        <Field label="Agreed amount" error={problem.amount} hint={perMetre === null ? 'No price per metre set for this fabric.' : `Asking ${formatKes(perMetre)} per metre${asking !== null ? ` = ${formatKes(asking)}` : ''}.`}>
          {(a) => (
            <UnitInput
              {...a}
              unit="KES"
              unitFirst
              value={shown}
              onChange={(e) => {
                setTouched(true)
                setAmount(e.target.value)
              }}
            />
          )}
        </Field>
      </form>
    </Drawer>
  )
}

function CheckoutDrawer({
  basket,
  total,
  customer,
  walkInName,
  onEdit,
  onRemove,
  onPickCustomer,
  onClose,
  onRecorded,
}: {
  basket: BasketLine[]
  total: number
  customer: Customer | null
  walkInName: string
  onEdit: (l: BasketLine) => void
  onRemove: (key: string) => void
  onPickCustomer: () => void
  onClose: () => void
  onRecorded: (sale: Sale) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [payments, setPayments] = useState<PaymentDraft[]>([{ method: 'cash', amount: '', code: '' }])
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  // With one payment the amount is always the whole total; splitting makes each amount editable.
  const split = payments.length > 1
  // The last payment may be left blank: it then takes whatever is still owed ("the rest").
  const typed = payments.map((p) => (p.amount.trim() === '' ? null : shillingsToCents(p.amount)))
  const othersTotal = typed.slice(0, -1).reduce<number>((s, a) => s + (a ?? 0), 0)
  const lastBlank = payments[payments.length - 1]?.amount.trim() === ''
  const amounts = payments.map((_, i) => {
    if (!split) return i === 0 ? total : 0
    if (i === payments.length - 1 && lastBlank) return Math.max(0, total - othersTotal)
    return typed[i]
  })
  const paid = amounts.reduce<number>((s, a) => s + (a ?? 0), 0)
  const remaining = total - paid

  const update = (i: number, patch: Partial<PaymentDraft>) => setPayments((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    if (basket.length === 0) return
    if (split && remaining !== 0) {
      setProblem({ status: 422, message: remaining > 0 ? `${formatKes(remaining)} still to pay.` : `Payments are ${formatKes(-remaining)} more than the total.`, fields: {} })
      return
    }
    if (payments.some((p) => p.method === 'account') && !customer) {
      setProblem({ status: 422, message: 'Choose the customer before putting a sale on "to pay".', fields: {} })
      return
    }

    const body: SaleBody = {
      customer_id: customer?.id ?? null,
      customer_name: customer ? undefined : walkInName.trim(),
      lines: basket.map((l) =>
        l.kind === 'product'
          ? { stock_item_id: l.product.id, quantity: l.quantity, total_cents: l.amountCents }
          : { roll_id: l.roll.id, length_cm: l.lengthCm, total_cents: l.amountCents },
      ),
      payments:
        total === 0
          ? []
          : payments
              .map((p, i) => ({ method: p.method, amount_cents: amounts[i] ?? 0, mpesa_code: p.code.trim() || null }))
              .filter((p) => p.amount_cents > 0),
    }

    setBusy(true)
    try {
      const sale = await api.recordSale(body)
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['day-book'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['rolls'] })
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      toast.success(`Sale ${sale.number} recorded · ${formatKes(sale.total_cents)}`)
      onRecorded(sale)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title="Take payment"
      description={customer ? `${customer.name}${customer.stall ? ` · ${customer.stall}` : ''}` : walkInName.trim() || 'Walk-in customer'}
      footer={
        <Button type="submit" form="checkout-form" busy={busy} disabled={basket.length === 0} className="w-full sm:w-auto">
          Record sale · {formatKes(total)}
        </Button>
      }
    >
      <form id="checkout-form" onSubmit={submit} className="grid gap-5" noValidate>
        <BasketLines basket={basket} onEdit={onEdit} onRemove={onRemove} />
        <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
          <span className="font-semibold text-ink-muted">Total</span>
          <span className="tabular font-display text-3xl text-plum">{formatKes(total)}</span>
        </div>

        {total > 0 && (
          <div className="grid gap-4">
            {payments.map((p, i) => {
              const method = PAYMENT_METHODS.find((m) => m.key === p.method)!
              return (
                <fieldset key={i} className="grid gap-3 rounded-2xl border border-line-soft p-3">
                  <legend className="px-1 text-sm font-semibold text-plum-700">{split ? `Payment ${i + 1}` : 'Paid by'}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={p.method === m.key}
                        onClick={() => {
                          update(i, { method: m.key, code: m.mpesa ? p.code : '' })
                          if (m.key === 'account' && !customer) onPickCustomer()
                        }}
                        className={cx(
                          'min-h-14 rounded-xl border px-2 py-2 text-center transition',
                          p.method === m.key ? 'border-rose bg-rose text-white' : 'border-line bg-white text-plum hover:bg-blush-100',
                        )}
                      >
                        <span className="block font-bold">{m.label}</span>
                        <span className={cx('block text-xs', p.method === m.key ? 'text-white/85' : 'text-ink-muted')}>{m.hint}</span>
                      </button>
                    ))}
                  </div>
                  {split && (
                    <Field label="Amount" error={f[`payments.${i}.amount_cents`]}>
                      {(a) => (
                        <UnitInput
                          {...a}
                          unit="KES"
                          unitFirst
                          value={p.amount}
                          onChange={(e) => update(i, { amount: e.target.value })}
                          placeholder={i === payments.length - 1 ? `${(Math.max(0, total - othersTotal) / 100).toLocaleString('en-KE')} (the rest)` : 'e.g. 2,000'}
                        />
                      )}
                    </Field>
                  )}
                  {method.mpesa && (
                    <Field label="M-Pesa code" error={f[`payments.${i}.mpesa_code`]} hint="From the M-Pesa message, e.g. TKL3X9ABCD. Optional, but it lets us match the statement.">
                      {(a) => (
                        <Input
                          {...a}
                          value={p.code}
                          onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck={false}
                          className="tabular tracking-wider uppercase"
                          maxLength={12}
                        />
                      )}
                    </Field>
                  )}
                  {p.method === 'account' && customer && <Notice tone="warn">{customer.name} will owe {formatKes(split ? (amounts[i] ?? 0) : total)}.</Notice>}
                  {split && (
                    <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}>
                      Remove this payment
                    </Button>
                  )}
                </fieldset>
              )
            })}

            {split && (
              <p className={cx('text-sm font-semibold', remaining === 0 ? 'text-success' : 'text-amber-800')}>
                {remaining === 0 ? 'Payments match the total.' : remaining > 0 ? `${formatKes(remaining)} still to pay.` : `${formatKes(-remaining)} too much.`}
              </p>
            )}
            {payments.length < 4 && (
              <Button
                type="button"
                variant="secondary"
                className="justify-self-start"
                onClick={() =>
                  setPayments((ps) => {
                    // Freeze what the current last payment covers, then the new one takes the rest.
                    const fixed = ps.map((p, j) => (j === ps.length - 1 && p.amount.trim() === '' ? { ...p, amount: split ? String((amounts[j] ?? 0) / 100) : '' } : p))
                    return [...fixed, { method: fixed[fixed.length - 1].method === 'cash' ? 'send_money' : 'cash', amount: '', code: '' }]
                  })
                }
              >
                {split ? 'Add another payment' : 'Split between two ways of paying'}
              </Button>
            )}
          </div>
        )}

        {problem && <ErrorNotice problem={problem.fields.payments ? { ...problem, message: problem.fields.payments } : problem} />}
        {Object.entries(f)
          .filter(([k]) => k.startsWith('lines.'))
          .map(([k, v]) => (
            <Notice key={k} tone="warn">
              {v}
            </Notice>
          ))}
      </form>
    </Drawer>
  )
}

function ReceiptDrawer({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <Drawer
      onClose={onClose}
      title={`Sale ${sale.number}`}
      description={sale.customer ? sale.customer.name : sale.customer_name || 'Walk-in customer'}
      footer={<Button onClick={onClose}>Next customer</Button>}
    >
      <div className="grid gap-4">
        <Pill tone="success">Recorded</Pill>
        <ul className="divide-y divide-line-soft">
          {sale.lines?.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-plum">{l.description}</span>
                <span className="text-sm text-ink-muted">{l.kind === 'fabric' ? formatMetres(l.length_cm) : quantityLabel(l.quantity ?? 0, l.unit)}</span>
              </span>
              <span className="tabular font-semibold">{formatKes(l.total_cents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
          <span className="font-semibold text-ink-muted">Total</span>
          <span className="tabular font-display text-3xl text-plum">{formatKes(sale.total_cents)}</span>
        </div>
        <ul className="text-sm">
          {sale.payments?.map((p) => (
            <li key={p.id} className="flex justify-between py-1">
              <span>
                {p.method_label}
                {p.mpesa_code && <span className="tabular text-ink-muted"> · {p.mpesa_code}</span>}
              </span>
              <span className="tabular">{formatKes(p.amount_cents)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  )
}
