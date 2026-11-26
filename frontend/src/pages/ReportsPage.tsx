import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { MoneyMethod, Report, ReportChartPoint } from '../api/types'
import { Button, Card, ErrorNotice, Input, Loading, Notice, PageHeader } from '../components/ui'
import { cx } from '../lib/cx'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../lib/payments'
import { quantityLabel } from '../lib/useCatalogue'
import { formatDate, formatKes, formatMetres, formatPhone, plural } from '../lib/units'

// Dates are plain "YYYY-MM-DD" strings in the shop's time zone; arithmetic is done at UTC midnight.
const todayInShop = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())
const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const toKey = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toKey(d)
}
const monthStart = (s: string) => `${s.slice(0, 7)}-01`

function presets(today: string): { key: string; label: string; from: string; to: string }[] {
  const weekday = (toDate(today).getUTCDay() + 6) % 7 // Monday = 0
  const thisMonth = monthStart(today)
  const lastMonthEnd = addDays(thisMonth, -1)
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'week', label: 'This week', from: addDays(today, -weekday), to: today },
    { key: 'month', label: 'This month', from: thisMonth, to: today },
    { key: 'last-month', label: 'Last month', from: monthStart(lastMonthEnd), to: lastMonthEnd },
    { key: 'year', label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today },
  ]
}

const METHODS = PAYMENT_METHODS.filter((m) => m.key !== 'account') as { key: MoneyMethod; label: string }[]
const expenseLabel = (key: string) => EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key

/** /reports: how the shop did over any dates. Owners always; other roles with "See reports". */
export function ReportsPage() {
  const today = todayInShop()
  const ranges = presets(today)
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? ranges[2].from
  const to = params.get('to') ?? ranges[2].to
  const active = ranges.find((r) => r.from === from && r.to === to)?.key
  const [custom, setCustom] = useState({ from, to })

  const report = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => api.report(from, to),
    placeholderData: keepPreviousData,
  })

  const pick = (nextFrom: string, nextTo: string) => {
    setCustom({ from: nextFrom, to: nextTo })
    setParams({ from: nextFrom, to: nextTo }, { replace: true })
  }

  const data = report.data
  const rangeLabel = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`

  return (
    <>
      <PageHeader title="Reports" subtitle={rangeLabel} />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Dates">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => pick(r.from, r.to)}
              aria-pressed={active === r.key}
              className={cx(
                'min-h-10 rounded-full border px-4 text-sm font-semibold transition',
                active === r.key ? 'border-plum bg-plum text-white' : 'border-line bg-white text-plum hover:bg-blush-100',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.from && custom.to) pick(custom.from <= custom.to ? custom.from : custom.to, custom.from <= custom.to ? custom.to : custom.from)
          }}
        >
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            From
            <Input type="date" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            To
            <Input type="date" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" />
          </label>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>
      </Card>

      {report.isLoading ? (
        <Loading label="Adding it up…" />
      ) : !data ? (
        <ErrorNotice problem={toProblem(report.error)} onRetry={() => report.refetch()} />
      ) : (
        <div className={cx('grid gap-4 transition-opacity', report.isFetching && 'opacity-60')}>
          {report.error && <ErrorNotice problem={toProblem(report.error)} />}
          <Summary data={data} />
          <SalesChart points={data.chart.points} bucket={data.chart.bucket} />

          <div className="grid gap-4 lg:grid-cols-2">
            <BestSellers data={data} />
            <ByKind data={data} />
          </div>

          {data.profit && <Profit profit={data.profit} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <MoneyByMethod data={data} />
            <Expenses data={data} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Orders data={data} />
            <Staff data={data} />
          </div>

          <Debtors data={data} />
        </div>
      )}
    </>
  )
}

function Tile({ label, value, note, tone = 'default' }: { label: string; value: string; note?: ReactNode; tone?: 'default' | 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-line-soft bg-white p-4 shadow-card">
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
      <strong
        className={cx(
          'tabular mt-2 block text-2xl tracking-tight break-words',
          tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-plum',
        )}
      >
        {value}
      </strong>
      {note && <span className="mt-1 block text-xs text-ink-muted">{note}</span>}
    </div>
  )
}

function Summary({ data }: { data: Report }) {
  const { sales, money } = data
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Sales"
        value={formatKes(sales.net_cents)}
        note={
          sales.returned_goods_cents > 0
            ? `${plural(sales.count, 'sale')}, less ${formatKes(sales.returned_goods_cents)} brought back`
            : `${plural(sales.count, 'sale')} · about ${formatKes(sales.average_cents)} each`
        }
      />
      <Tile label="Money in" value={formatKes(money.in_cents)} note="cash, Send money and Paybill" />
      <Tile label="Money out" value={formatKes(money.out_cents)} note="refunds and expenses" />
      <Tile
        label="Left after money out"
        value={formatKes(money.net_cents)}
        tone={money.net_cents < 0 ? 'bad' : 'good'}
        note={money.put_on_account_cents > 0 ? `${formatKes(money.put_on_account_cents)} more given on "to pay"` : undefined}
      />
    </div>
  )
}

const shortDay = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortMonth = new Intl.DateTimeFormat('en-KE', { month: 'short', year: '2-digit', timeZone: 'UTC' })

function SalesChart({ points, bucket }: { points: ReportChartPoint[]; bucket: 'day' | 'month' }) {
  const max = Math.max(1, ...points.map((p) => p.sales_cents))
  const best = points.reduce((a, b) => (b.sales_cents > a.sales_cents ? b : a), points[0])
  const label = (p: ReportChartPoint) => (bucket === 'month' ? shortMonth : shortDay).format(toDate(p.date))
  const total = points.reduce((n, p) => n + p.sales_cents, 0)

  if (points.length <= 1) return null
  return (
    <Card
      title={bucket === 'month' ? 'Sales by month' : 'Sales by day'}
      action={total > 0 && best ? <span className="text-xs text-ink-muted">Best: {label(best)}, {formatKes(best.sales_cents)}</span> : undefined}
    >
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No sales in these dates.</p>
      ) : (
        <>
          <div className="flex h-44 items-end gap-px sm:gap-1" role="img" aria-label={`Sales per ${bucket}, highest ${formatKes(max)}`}>
            {points.map((p) => (
              <div key={p.date} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                <div
                  className={cx('rounded-t-sm bg-rose/80 transition group-hover:bg-rose', p.sales_cents === 0 && 'bg-line-soft')}
                  style={{ height: `${Math.max(p.sales_cents > 0 ? 3 : 1, (p.sales_cents / max) * 100)}%` }}
                  title={`${label(p)}: ${formatKes(p.sales_cents)} · ${plural(p.sales_count, 'sale')}${p.expenses_cents ? ` · ${formatKes(p.expenses_cents)} spent` : ''}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
            <span>{label(points[0])}</span>
            {points.length > 2 && <span>{label(points[Math.floor(points.length / 2)])}</span>}
            <span>{label(points[points.length - 1])}</span>
          </div>
        </>
      )}
    </Card>
  )
}

function ShareBar({ share }: { share: number }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blush-200">
      <div className="h-full rounded-full bg-rose" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-ink-muted">{children}</p>
}

function BestSellers({ data }: { data: Report }) {
  const top = data.top_products[0]?.total_cents ?? 1
  return (
    <Card title="Best sellers">
      {data.top_products.length === 0 ? (
        <Empty>No products sold in these dates.</Empty>
      ) : (
        <ol className="grid gap-3">
          {data.top_products.map((p, i) => (
            <li key={p.stock_item_id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="tabular mr-2 text-ink-faint">{i + 1}</span>
                  <span className="font-semibold text-plum">{p.name}</span>
                </span>
                <span className="tabular flex-none text-ink">{formatKes(p.total_cents)}</span>
              </div>
              <div className="text-xs text-ink-muted">{quantityLabel(p.quantity, p.unit)} sold</div>
              <ShareBar share={p.total_cents / top} />
            </li>
          ))}
        </ol>
      )}
      {data.top_fabrics.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-bold text-plum">Fabric by the metre</h3>
          <ul className="divide-y divide-line-soft text-sm">
            {data.top_fabrics.map((f) => (
              <li key={f.fabric_id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs font-bold text-rose-dark">{f.code}</span> {f.name}
                </span>
                <span className="tabular flex-none text-right">
                  {formatKes(f.total_cents)}
                  <span className="block text-xs text-ink-muted">{formatMetres(f.length_cm)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function ByKind({ data }: { data: Report }) {
  const total = data.categories.reduce((n, c) => n + c.total_cents, 0) || 1
  return (
    <Card title="Sales by kind">
      {data.categories.length === 0 ? (
        <Empty>Nothing sold in these dates.</Empty>
      ) : (
        <ul className="grid gap-3">
          {data.categories.map((c) => (
            <li key={c.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-plum">{c.name}</span>
                <span className="tabular text-ink">
                  {formatKes(c.total_cents)} <span className="text-xs text-ink-muted">· {Math.round((c.total_cents / total) * 100)}%</span>
                </span>
              </div>
              <div className="text-xs text-ink-muted">{c.length_cm != null ? formatMetres(c.length_cm) : `${c.quantity ?? 0} sold`}</div>
              <ShareBar share={c.total_cents / total} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Profit({ profit }: { profit: NonNullable<Report['profit']> }) {
  const rows: [string, number, string?][] = [
    ['Sales and collected orders', profit.revenue_cents],
    ['What the goods cost to buy', -profit.cost_cents],
    ['Gross profit', profit.gross_cents, 'font-bold text-plum'],
    ['Expenses', -profit.expenses_cents],
    ['Profit after expenses', profit.after_expenses_cents, 'font-bold'],
  ]
  return (
    <Card title="Rough profit">
      <dl className="grid gap-2 text-sm sm:max-w-md">
        {rows.map(([label, cents, cls]) => (
          <div key={label} className={cx('flex justify-between gap-3', cls)}>
            <dt>{label}</dt>
            <dd className={cx('tabular', label === 'Profit after expenses' && (cents < 0 ? 'text-danger' : 'text-success'))}>
              {cents < 0 ? `− ${formatKes(-cents)}` : formatKes(cents)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-muted">
        Uses each product's cost price today and each roll's cost per metre. Custom orders count when collected.
      </p>
      {profit.lines_without_cost > 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            {plural(profit.lines_without_cost, 'item')} sold here {profit.lines_without_cost === 1 ? 'has' : 'have'} no cost price, so profit looks higher than it is. Add
            costs on the Products page.
          </Notice>
        </div>
      )}
    </Card>
  )
}

function MoneyByMethod({ data }: { data: Report }) {
  const m = data.money
  const inFor = (k: MoneyMethod) => m.sales_in[k] + m.order_payments_in[k] + m.account_payments_in[k]
  const outFor = (k: MoneyMethod) => m.refunds_out[k] + m.expenses_out[k]
  return (
    <Card title="Money by method">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="py-1.5 font-semibold">Method</th>
            <th className="py-1.5 text-right font-semibold">In</th>
            <th className="py-1.5 text-right font-semibold">Out</th>
            <th className="py-1.5 text-right font-semibold">Left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {METHODS.map((method) => (
            <tr key={method.key}>
              <td className="py-2 font-semibold text-plum">{method.label}</td>
              <td className="tabular py-2 text-right">{formatKes(inFor(method.key))}</td>
              <td className="tabular py-2 text-right">{formatKes(outFor(method.key))}</td>
              <td className={cx('tabular py-2 text-right font-semibold', m.net_by_method[method.key] < 0 && 'text-danger')}>
                {formatKes(m.net_by_method[method.key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-muted">
        In counts sales, custom order payments and debts paid off. "To pay" sales are not money yet: {formatKes(m.put_on_account_cents)} was given on
        credit in these dates.
      </p>
    </Card>
  )
}

function Expenses({ data }: { data: Report }) {
  const total = data.expenses.total_cents || 1
  return (
    <Card title="Expenses" action={<span className="tabular text-sm font-bold text-plum">{formatKes(data.expenses.total_cents)}</span>}>
      {data.expenses.by_category.length === 0 ? (
        <Empty>No expenses recorded in these dates.</Empty>
      ) : (
        <ul className="grid gap-3">
          {data.expenses.by_category.map((e) => (
            <li key={e.category}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-plum">{expenseLabel(e.category)}</span>
                <span className="tabular">{formatKes(e.total_cents)}</span>
              </div>
              <div className="text-xs text-ink-muted">{plural(e.count, 'payment')}</div>
              <ShareBar share={e.total_cents / total} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Orders({ data }: { data: Report }) {
  const o = data.orders
  const rows: [string, string][] = [
    ['Taken', `${plural(o.taken_count, 'order')} · ${formatKes(o.taken_cents)}`],
    ['Collected', `${plural(o.collected_count, 'order')} · ${formatKes(o.collected_cents)}`],
    ['Cancelled', plural(o.cancelled_count, 'order')],
  ]
  return (
    <Card title="Custom orders" action={<Link to="/orders" className="text-sm font-bold text-rose-dark">Orders</Link>}>
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="tabular">{value}</dd>
          </div>
        ))}
      </dl>
      {o.open_count > 0 && (
        <p className="mt-3 border-t border-line-soft pt-3 text-sm">
          Open today: {plural(o.open_count, 'order')}, {formatKes(o.open_balance_cents)} still to be paid.
        </p>
      )}
    </Card>
  )
}

function Staff({ data }: { data: Report }) {
  return (
    <Card title="Sales by staff">
      {data.staff.length === 0 ? (
        <Empty>No sales in these dates.</Empty>
      ) : (
        <ul className="divide-y divide-line-soft text-sm">
          {data.staff.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-semibold text-plum">{s.name}</span>
              <span className="tabular">
                {formatKes(s.total_cents)} <span className="text-xs text-ink-muted">· {plural(s.count, 'sale')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Debtors({ data }: { data: Report }) {
  const d = data.debtors
  return (
    <Card title="Who owes the shop today" action={<Link to="/customers" className="text-sm font-bold text-rose-dark">Customers</Link>}>
      {d.count === 0 ? (
        <Empty>Nobody owes anything.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {plural(d.count, 'customer')} owe <strong className="tabular text-plum">{formatKes(d.total_cents)}</strong> in all.
          </p>
          <ul className="divide-y divide-line-soft text-sm">
            {d.customers.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-semibold text-plum">{c.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{[c.stall, formatPhone(c.phone)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tabular flex-none font-semibold text-danger">{formatKes(c.owed_cents)}</span>
              </li>
            ))}
          </ul>
          {d.count > d.customers.length && <p className="mt-2 text-xs text-ink-muted">Showing the {d.customers.length} who owe the most.</p>}
        </>
      )}
    </Card>
  )
}
