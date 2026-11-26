import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useLinkedId } from '../lib/useLinkedId'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { AccountPayment, DayBook, Expense, PaymentMethod, Sale } from '../api/types'
import { CashCountDrawer } from '../components/CashCountDrawer'
import { ExpenseDrawer } from '../components/ExpenseDrawer'
import { ReturnDrawer } from '../components/ReturnDrawer'
import { VoidDrawer } from '../components/VoidDrawer'
import { useCan } from '../auth/useMe'
import { Drawer } from '../components/Drawer'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { useToast } from '../components/toast-context'
import { Button, ButtonLink, DetailList, EmptyState, ErrorNotice, Field, Input, Loading, Notice, PageHeader, Pill, Textarea } from '../components/ui'
import { cx } from '../lib/cx'
import { PAYMENT_METHODS } from '../lib/payments'
import { PRODUCTS_KEY, quantityLabel } from '../lib/useCatalogue'
import { formatDate, formatDateTime, formatKes, formatMetres } from '../lib/units'

const todayInNairobi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const saleName = (s: Sale) => (s.customer ? s.customer.name : s.customer_name || 'Customer')
const lineQty = (l: NonNullable<Sale['lines']>[number]) => (l.kind === 'fabric' ? formatMetres(l.length_cm) : quantityLabel(l.quantity ?? 0, l.unit))
const modes = (s: Sale) =>
  (s.payments ?? [])
    .map((p) => p.method_label)
    .filter((v, i, all) => all.indexOf(v) === i)
    .join(' + ') || '—'

/** One shop day, laid out like the sales book, with the totals the book never had. */
export function DayBookPage() {
  const [params, setParams] = useSearchParams()
  const today = todayInNairobi()
  const date = params.get('date') ?? today
  const [saleId, setSaleId] = useLinkedId('sale')
  const [panel, setPanel] = useState<'expense' | 'count' | null>(null)
  const [voiding, setVoiding] = useState<{ kind: 'payment'; item: AccountPayment } | { kind: 'expense'; item: Expense } | null>(null)
  const canExpense = useCan('record_expenses')
  const canCount = useCan('close_day')
  const canVoid = useCan('void_sales')
  const qc = useQueryClient()
  const toast = useToast()

  const book = useQuery({ queryKey: ['day-book', date], queryFn: () => api.dayBook(date) })
  const go = (d: string) => {
    const next = new URLSearchParams(params)
    next.delete('sale')
    if (d === today) next.delete('date')
    else next.set('date', d)
    setParams(next, { replace: true })
  }

  const data = book.data
  // A linked sale opens even when it is not on the day shown (e.g. a voided sale from an alert).
  const listedSale = data?.sales.find((s) => s.id === saleId)
  const linkedSale = useQuery({ queryKey: ['sale', saleId], queryFn: () => api.sale(saleId!), enabled: saleId !== null && !!data && !listedSale })
  const open = listedSale ?? linkedSale.data ?? null
  const totals = data?.totals

  return (
    <>
      <PageHeader
        title="Day book"
        subtitle={data ? `${data.weekday}, ${formatDate(data.date)}` : formatDate(date)}
        action={
          <>
            {canExpense && date === today && (
              <Button variant="secondary" onClick={() => setPanel('expense')}>
                Add expense
              </Button>
            )}
            <ButtonLink to="/sell">New sale</ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" aria-label="Previous day" onClick={() => go(shiftDate(date, -1))} className="px-3">
          <ChevronLeftIcon />
        </Button>
        <Input type="date" value={date} max={today} onChange={(e) => e.target.value && go(e.target.value)} className="max-w-44" aria-label="Day" />
        <Button variant="secondary" aria-label="Next day" disabled={date >= today} onClick={() => go(shiftDate(date, 1))} className="px-3">
          <ChevronRightIcon />
        </Button>
        {date !== today && (
          <Button variant="ghost" onClick={() => go(today)}>
            Today
          </Button>
        )}
      </div>

      {book.error && <ErrorNotice problem={toProblem(book.error)} onRetry={() => book.refetch()} />}
      {book.isLoading && <Loading />}

      {totals && (
        <section aria-label="Totals" className="mb-5 grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="col-span-2 rounded-2xl bg-plum p-4 text-white sm:col-span-1">
              <p className="text-sm text-blush-300">Total sold</p>
              <p className="tabular font-display text-2xl">{formatKes(totals.total_cents)}</p>
              <p className="text-xs text-blush-300">{totals.sales_count} {totals.sales_count === 1 ? 'sale' : 'sales'}</p>
            </div>
            {PAYMENT_METHODS.map((m) => (
              <div key={m.key} className="rounded-2xl border border-line-soft bg-white p-3 shadow-card">
                <p className="text-sm text-ink-muted">{m.label}</p>
                <p className={cx('tabular text-lg font-semibold', m.key === 'account' && totals.by_method.account > 0 ? 'text-amber-800' : 'text-plum')}>
                  {formatKes(totals.by_method[m.key as PaymentMethod])}
                </p>
              </div>
            ))}
          </div>
          {(totals.missing_mpesa_codes > 0 || totals.below_asking_cents > 0 || totals.voided_count > 0) && (
            <div className="flex flex-wrap gap-2 text-sm">
              {totals.missing_mpesa_codes > 0 && <Pill tone="warn">{totals.missing_mpesa_codes} M-Pesa {totals.missing_mpesa_codes === 1 ? 'payment' : 'payments'} without a code</Pill>}
              {totals.below_asking_cents > 0 && <Pill>{formatKes(totals.below_asking_cents)} below asking prices</Pill>}
              {totals.voided_count > 0 && <Pill tone="muted">{totals.voided_count} voided</Pill>}
            </div>
          )}
        </section>
      )}

      {data && <CashPanel book={data} canCount={canCount} onCount={() => setPanel('count')} />}

      {data && data.sales.length === 0 && <EmptyState title="No sales recorded">{date === today ? 'Sales recorded on the Sell screen appear here straight away.' : 'Nothing was sold on this day.'}</EmptyState>}

      {data && data.sales.length > 0 && (
        <>
          {/* Phone: one card per customer basket. */}
          <ul className="grid gap-2 md:hidden">
            {data.sales.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSaleId(s.id)}
                  className={cx('w-full rounded-2xl border border-line-soft bg-white p-3 text-left shadow-card', s.status === 'voided' && 'opacity-60')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cx('truncate font-semibold text-plum', s.status === 'voided' && 'line-through')}>{saleName(s)}</span>
                    <span className={cx('tabular font-semibold', s.status === 'voided' && 'line-through')}>{formatKes(s.total_cents)}</span>
                  </div>
                  <ul className="mt-1 text-sm text-ink">
                    {s.lines?.map((l) => (
                      <li key={l.id} className="flex justify-between gap-2">
                        <span className="truncate">{l.description}</span>
                        <span className="flex-none text-ink-muted">{lineQty(l)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-ink-muted">
                    {modes(s)} · {formatDateTime(s.created_at).split(', ').pop()} · {s.number}
                    {s.status === 'voided' && ' · VOIDED'}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* Laptop: the book's own columns. */}
          <div className="hidden overflow-hidden rounded-2xl border border-line-soft bg-white shadow-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-blush-50 text-left text-xs font-bold tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Mode of payment</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              {data.sales.map((s) => {
                const lines = s.lines ?? []
                const voided = s.status === 'voided'
                return (
                  <tbody key={s.id} onClick={() => setSaleId(s.id)} className={cx('cursor-pointer border-t border-line-soft hover:bg-blush-50', voided && 'text-ink-muted line-through')}>
                    {lines.map((l, i) => (
                      <tr key={l.id}>
                        {i === 0 && (
                          <td rowSpan={lines.length} className="px-4 py-2 align-top font-semibold text-plum">
                            {saleName(s)}
                            <span className="block text-xs font-normal text-ink-muted">{s.number}</span>
                          </td>
                        )}
                        <td className="px-4 py-2">{l.description}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{lineQty(l)}</td>
                        {i === 0 && (
                          <td rowSpan={lines.length} className="px-4 py-2 align-top">
                            {modes(s)}
                            {voided && <span className="block text-xs font-bold text-danger no-underline">Voided</span>}
                          </td>
                        )}
                        <td className="tabular px-4 py-2 text-right whitespace-nowrap">
                          {formatKes(l.total_cents)}
                          {lines.length > 1 && i === lines.length - 1 && <span className="block font-bold text-plum">= {formatKes(s.total_cents)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        </>
      )}

      {data && (data.account_payments.length > 0 || data.order_payments.length > 0 || data.returns.length > 0 || data.expenses.length > 0) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <MoneyList
            title="Custom order payments"
            empty="No deposits or balances."
            rows={data.order_payments.map((p) => ({
              key: `o${p.id}`,
              voided: p.voided,
              title: `${p.customer?.name ?? 'Customer'} · ${p.order.number}`,
              detail: `${p.method_label}${p.mpesa_code ? ` · ${p.mpesa_code}` : ''}${p.voided ? ` · voided: ${p.void_reason}` : ''}`,
              amount: p.amount_cents,
              sign: p.method === 'account' ? '' : '+',
            }))}
          />
          <MoneyList
            title="Paid towards accounts"
            empty="No debt payments."
            rows={data.account_payments.map((p) => ({
              key: `p${p.id}`,
              voided: p.voided,
              title: p.customer?.name ?? 'Customer',
              detail: `${p.method_label}${p.mpesa_code ? ` · ${p.mpesa_code}` : ''}${p.voided ? ` · voided: ${p.void_reason}` : ''}`,
              amount: p.amount_cents,
              sign: '+',
              onClick: canVoid && !p.voided ? () => setVoiding({ kind: 'payment', item: p }) : undefined,
            }))}
          />
          <MoneyList
            title="Returns"
            empty="Nothing came back."
            rows={data.returns.map((r) => ({
              key: `r${r.id}`,
              voided: false,
              title: `${r.customer_name} · ${r.items.map((i) => `${i.quantity} × ${i.description}`).join(', ')}`,
              detail: `${r.refund_label} · ${r.reason}`,
              amount: r.refund_cents,
              sign: r.refund_method === 'none' || r.refund_method === 'account' ? '' : '−',
            }))}
          />
          <MoneyList
            title="Expenses"
            empty="No expenses."
            rows={data.expenses.map((e) => ({
              key: `e${e.id}`,
              voided: e.voided,
              title: `${e.category_label}${e.paid_to ? ` · ${e.paid_to}` : ''}`,
              detail: `${e.method_label}${e.description ? ` · ${e.description}` : ''}${e.voided ? ` · voided: ${e.void_reason}` : ''}`,
              amount: e.amount_cents,
              sign: '−',
              onClick: canVoid && !e.voided ? () => setVoiding({ kind: 'expense', item: e }) : undefined,
            }))}
          />
        </div>
      )}

      {open && <SaleDrawer key={open.id} sale={open} onClose={() => setSaleId(null)} />}
      {panel === 'expense' && <ExpenseDrawer onClose={() => setPanel(null)} />}
      {panel === 'count' && data && <CashCountDrawer book={data} onClose={() => setPanel(null)} />}
      {voiding && (
        <VoidDrawer
          title={voiding.kind === 'payment' ? 'Void this payment?' : 'Void this expense?'}
          description={`${voiding.kind === 'payment' ? (voiding.item.customer?.name ?? '') : voiding.item.category_label} · ${formatKes(voiding.item.amount_cents)}`}
          explanation={
            voiding.kind === 'payment'
              ? 'The amount goes back onto what the customer owes. The payment stays in the book, crossed out, with your name and reason.'
              : 'It stops counting against the day. The expense stays in the book, crossed out, with your name and reason.'
          }
          onClose={() => setVoiding(null)}
          onVoid={async (reason) => {
            if (voiding.kind === 'payment') await api.voidAccountPayment(voiding.item.id, reason)
            else await api.voidExpense(voiding.item.id, reason)
            qc.invalidateQueries({ queryKey: ['day-book'] })
            qc.invalidateQueries({ queryKey: ['customers'] })
            toast.success(voiding.kind === 'payment' ? 'Payment voided.' : 'Expense voided.')
            setVoiding(null)
          }}
        />
      )}
    </>
  )
}

function SaleDrawer({ sale: initial, onClose }: { sale: Sale; onClose: () => void }) {
  const canVoid = useCan('void_sales')
  const canReturn = useCan('take_returns')
  const [sale, setSale] = useState(initial)
  const [voiding, setVoiding] = useState(false)
  const [returning, setReturning] = useState(false)
  const hasReturns = (sale.returns?.length ?? 0) > 0
  const canBeReturned = sale.status === 'posted' && (sale.lines ?? []).some((l) => l.kind === 'product' && (l.quantity ?? 0) > l.returned_quantity)

  if (returning) {
    return (
      <ReturnDrawer
        sale={sale}
        onClose={() => setReturning(false)}
        onReturned={(s) => {
          setSale(s)
          setReturning(false)
        }}
      />
    )
  }

  if (voiding) {
    return <VoidForm sale={sale} onClose={() => setVoiding(false)} onVoided={(s) => { setSale(s); setVoiding(false) }} />
  }

  return (
    <Drawer
      onClose={onClose}
      title={`Sale ${sale.number}`}
      description={`${saleName(sale)} · ${formatDateTime(sale.created_at)}`}
      footer={
        (canReturn && canBeReturned) || (canVoid && sale.status === 'posted' && !hasReturns && !sale.approval) ? (
          <>
            {canReturn && canBeReturned && (
              <Button variant="secondary" onClick={() => setReturning(true)}>
                Goods came back
              </Button>
            )}
            {canVoid && sale.status === 'posted' && !hasReturns && !sale.approval && (
              <Button variant="danger" onClick={() => setVoiding(true)}>
                Void this sale
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        {sale.status === 'voided' && (
          <Notice tone="warn">
            Voided by {sale.voided_by?.name} on {formatDateTime(sale.voided_at)}: {sale.void_reason}
          </Notice>
        )}
        <ul className="divide-y divide-line-soft">
          {sale.lines?.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-plum">{l.description}</span>
                <span className="text-sm text-ink-muted">
                  {lineQty(l)}
                  {l.asking_total_cents !== null && l.asking_total_cents > l.total_cents && ` · asking ${formatKes(l.asking_total_cents)}`}
                  {l.returned_quantity > 0 && <span className="font-semibold text-amber-800"> · {l.returned_quantity} returned</span>}
                </span>
              </span>
              <span className="tabular font-semibold">{formatKes(l.total_cents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line-soft pt-3">
          <span className="font-semibold text-ink-muted">Total</span>
          <span className="tabular font-display text-2xl text-plum">{formatKes(sale.total_cents)}</span>
        </div>
        {sale.returns?.map((r) => (
          <Notice key={r.id}>
            <strong>{r.number}</strong>: {r.refund_label}
            {r.refund_cents > 0 && ` ${formatKes(r.refund_cents)}`} · {r.reason} · {r.created_by?.name}, {formatDateTime(r.created_at)}
          </Notice>
        ))}
        {sale.approval && <Notice>Sold from goods on approval ({sale.approval.number}).</Notice>}
        <DetailList
          items={[
            ...(sale.payments ?? []).map((p): [string, string] => [p.method_label, `${formatKes(p.amount_cents)}${p.mpesa_code ? ` · ${p.mpesa_code}` : ''}`]),
            ['Served by', sale.sold_by?.name ?? ''],
            ['Customer', sale.customer ? `${sale.customer.name}${sale.customer.stall ? ` · ${sale.customer.stall}` : ''}` : sale.customer_name || 'Walk-in'],
            ['Note', sale.note],
          ]}
        />
      </div>
    </Drawer>
  )
}

function VoidForm({ sale, onClose, onVoided }: { sale: Sale; onClose: () => void; onVoided: (s: Sale) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setProblem({ status: 422, message: 'Say why the sale is being voided.', fields: { reason: 'Say why the sale is being voided.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const voided = await api.voidSale(sale.id, reason.trim())
      qc.invalidateQueries({ queryKey: ['day-book'] })
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success(`Sale ${voided.number} voided. Stock is back on the shelf.`)
      onVoided(voided)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={`Void sale ${sale.number}?`}
      description={`${saleName(sale)} · ${formatKes(sale.total_cents)}`}
      footer={
        <Button type="submit" form="void-form" variant="danger" busy={busy}>
          Void sale
        </Button>
      }
    >
      <form id="void-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Notice>The goods go back on the shelf and the payments stop counting. The sale stays in the book, crossed out, with your name and reason.</Notice>
        <Field label="Reason" error={problem?.fields.reason}>
          {(a) => <Textarea {...a} rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />}
        </Field>
        {problem && !problem.fields.reason && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}

function CashPanel({ book, canCount, onCount }: { book: DayBook; canCount: boolean; onCount: () => void }) {
  const m = book.money
  const count = m.count
  const out = m.expenses_out.cash + m.refunds_out.cash
  return (
    <section aria-label="Cash" className="mb-5 flex flex-col gap-3 rounded-2xl border border-line-soft bg-white p-4 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">Cash in the drawer should be</p>
        <p className="tabular font-display text-2xl text-plum">{formatKes(m.expected_cash_cents)}</p>
        <p className="text-xs text-ink-muted">
          {formatKes(m.opening_cash_cents)} float + {formatKes(m.sales_in.cash + m.order_payments_in.cash + m.account_payments_in.cash)} cash in
          {out > 0 && ` − ${formatKes(out)} paid out`}
          {m.account_payments_in.send_money + m.account_payments_in.paybill > 0 &&
            ` · M-Pesa debt payments ${formatKes(m.account_payments_in.send_money + m.account_payments_in.paybill)}`}
        </p>
      </div>
      {count && (
        <div className={cx('rounded-xl px-3 py-2 text-sm', count.difference_cents === 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
          <p className="font-bold">
            Counted {formatKes(count.counted_cents)}
            {count.difference_cents !== 0 && ` · ${count.difference_cents > 0 ? 'over' : 'short'} ${formatKes(Math.abs(count.difference_cents))}`}
          </p>
          <p className="text-xs text-ink-muted">
            {count.counted_by?.name}, {formatDateTime(count.created_at)}
            {count.kept_cents > 0 && ` · ${formatKes(count.kept_cents)} left in drawer`}
          </p>
        </div>
      )}
      {canCount && (
        <Button variant={count ? 'secondary' : 'primary'} onClick={onCount}>
          {count ? 'Count again' : 'Count the cash'}
        </Button>
      )}
    </section>
  )
}

interface MoneyRow {
  key: string
  voided: boolean
  title: string
  detail: string
  amount: number
  sign: string
  onClick?: () => void
}

function MoneyList({ title, empty, rows }: { title: string; empty: string; rows: MoneyRow[] }) {
  return (
    <section className="rounded-2xl border border-line-soft bg-white p-4 shadow-card">
      <h2 className="mb-2 font-display text-lg text-plum">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => {
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate text-sm font-semibold text-plum', r.voided && 'line-through')}>{r.title}</span>
                  <span className="block truncate text-xs text-ink-muted">{r.detail}</span>
                </span>
                <span className={cx('tabular text-sm font-semibold', r.voided && 'text-ink-muted line-through')}>
                  {r.sign}
                  {formatKes(r.amount)}
                </span>
              </>
            )
            return (
              <li key={r.key}>
                {r.onClick ? (
                  <button type="button" onClick={r.onClick} className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-blush-50" title="Tap to void">
                    {body}
                  </button>
                ) : (
                  <div className="flex min-h-12 items-center gap-3 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
