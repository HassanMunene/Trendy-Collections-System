import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Dashboard, HomeAlert, HomeMonth, HomeSale, HomeToday, HomeWork } from '../api/types'
import { useCan, useCurrentUser } from '../auth/useMe'
import { MovementRow } from '../components/MovementRow'
import { RollCard } from '../components/RollCard'
import {
    AlertTriangleIcon,
    AuditIcon,
    BanknoteIcon,
    CartIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    RollIcon,
    type IconProps,
} from '../components/icons'
import { Button, ButtonLink, Card, EmptyState, ErrorNotice, Loading, Pill } from '../components/ui'
import { cx } from '../lib/cx'
import { PAYMENT_METHODS } from '../lib/payments'
import { quantityLabel } from '../lib/useCatalogue'
import { formatDate, formatKes, formatMetres, plural } from '../lib/units'

function greeting() {
    const hour = Number(new Intl.DateTimeFormat('en-KE', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' }).format(new Date()))
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

const clock = new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
const methodLabel = (m: string) => PAYMENT_METHODS.find((p) => p.key === m)?.label ?? m

/** "+20%" / "−15%" compared with an earlier amount, or null when there is nothing to compare. */
function change(now: number, before: number): { text: string; up: boolean } | null {
    if (before <= 0) return null
    const pct = Math.round(((now - before) / before) * 100)
    return { text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`, up: pct >= 0 }
}

/**
 * Home: what the shop is doing right now, for someone checking from home. Today's money first,
 * then anything that needs attention (each line opens the exact record), the month so far,
 * the latest sales, work waiting, and stock last.
 */
export function DashboardPage() {
    const me = useCurrentUser()
    const canSell = useCan('sell')
    const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 })

    return (
        <>
            <header className="flex flex-wrap items-end justify-between gap-3 pt-5 pb-4 sm:pt-7 sm:pb-5">
                <div>
                    <h1 className="font-display text-2xl leading-tight text-plum sm:text-3xl">
                        {greeting()}, {me.name.split(' ')[0]}
                    </h1>
                    <p className="mt-1 text-sm text-ink-muted">
                        Here is the shop right now{dataUpdatedAt ? ` · updated ${clock.format(dataUpdatedAt)}` : ''}.
                    </p>
                </div>
                {canSell && (
                    <ButtonLink to="/sell">
                        <CartIcon size={18} />
                        New sale
                    </ButtonLink>
                )}
            </header>

            {isLoading && <Loading />}
            {error && <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />}

            {data && (
                <div className="grid gap-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                        {data.today && <TodayCard today={data.today} />}
                        <AttentionCard alerts={data.attention} />
                    </div>

                    {(data.month || data.recent_sales) && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {data.month && <MonthCard month={data.month} />}
                            {data.recent_sales && <RecentSales sales={data.recent_sales} />}
                        </div>
                    )}

                    {data.work && data.work.length > 0 && <WorkCard work={data.work} />}

                    <StockSection data={data} />
                </div>
            )}
        </>
    )
}

function TodayCard({ today }: { today: HomeToday }) {
    const vs = change(today.sales_cents, today.last_week_same_time_cents)
    const count = today.count
    const money: [string, number][] = [
        ['Cash', today.in_by_method.cash],
        ['Send money', today.in_by_method.send_money],
        ['Paybill', today.in_by_method.paybill],
        ['Expenses', today.expenses_cents],
    ]

    return (
        <Card title="Today" action={<Link to="/day-book" className="text-sm font-bold text-rose-dark">Day book</Link>}>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <strong className="tabular text-4xl tracking-tight text-plum">{formatKes(today.sales_cents)}</strong>
                <span className="pb-1 text-sm text-ink-muted">sold · {plural(today.sales_count, 'sale')}</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
                {vs ? (
                    <>
                        <span className={cx('font-bold', vs.up ? 'text-success' : 'text-danger')}>{vs.text}</span> on last {today.last_week_weekday} by this time (
                        {formatKes(today.last_week_same_time_cents)})
                    </>
                ) : (
                    `Nothing sold last ${today.last_week_weekday} by this time.`
                )}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {money.map(([label, cents]) => (
                    <div key={label} className="rounded-xl bg-blush-50 px-3 py-2">
                        <dt className="text-xs font-semibold text-ink-muted">{label === 'Expenses' ? 'Spent' : `${label} in`}</dt>
                        <dd className="tabular font-bold text-plum">{formatKes(cents)}</dd>
                    </div>
                ))}
            </dl>

            <p className="mt-3 border-t border-line-soft pt-3 text-sm">
                {count ? (
                    <>
                        Day closed: {formatKes(count.counted_cents)} counted{count.counted_by ? ` by ${count.counted_by}` : ''}
                        {count.difference_cents === 0 ? (
                            <span className="font-semibold text-success">, matches.</span>
                        ) : (
                            <span className="font-semibold text-danger">
                                , {formatKes(Math.abs(count.difference_cents))} {count.difference_cents < 0 ? 'short' : 'over'}.
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        The drawer should hold <strong className="tabular text-plum">{formatKes(today.expected_cash_cents)}</strong> now.
                    </>
                )}
                {today.put_on_account_cents > 0 && <span className="block text-xs text-ink-muted">{formatKes(today.put_on_account_cents)} given on "to pay" today.</span>}
            </p>
        </Card>
    )
}

const ALERT_TONES: Record<HomeAlert['tone'], { dot: string; icon: (p: IconProps) => React.JSX.Element }> = {
    danger: { dot: 'bg-danger-soft text-danger', icon: AlertTriangleIcon },
    warn: { dot: 'bg-amber-100 text-amber-800', icon: AlertTriangleIcon },
    info: { dot: 'bg-blush-100 text-rose-dark', icon: BanknoteIcon },
}

function AttentionCard({ alerts }: { alerts: HomeAlert[] }) {
    return (
        <Card title="Needs attention" action={alerts.length > 0 ? <Pill tone="warn">{alerts.length}</Pill> : undefined}>
            {alerts.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl bg-success-soft p-4 text-success">
                    <CheckCircleIcon />
                    <span className="font-semibold">All good. Nothing needs you right now.</span>
                </div>
            ) : (
                <ul className="-mx-2 divide-y divide-line-soft">
                    {alerts.map((a) => {
                        const tone = ALERT_TONES[a.tone]
                        return (
                            <li key={a.key}>
                                <Link to={a.link} className="flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-blush-50">
                                    <span className={cx('mt-0.5 grid size-8 flex-none place-items-center rounded-full', tone.dot)}>
                                        <tone.icon size={16} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-plum">{a.title}</span>
                                        <span className="block text-sm text-ink-muted">{a.detail}</span>
                                    </span>
                                    <ChevronRightIcon className="mt-1.5 size-4 flex-none text-ink-faint" />
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Card>
    )
}

function MonthCard({ month }: { month: HomeMonth }) {
    const vs = change(month.sales_cents, month.last_month_same_time_cents)
    const best = month.best_seller_week
    return (
        <Card title={`${month.name} so far`} action={<Link to="/reports" className="text-sm font-bold text-rose-dark">Reports</Link>}>
            <strong className="tabular block text-3xl tracking-tight text-plum">{formatKes(month.sales_cents)}</strong>
            <p className="mt-1 text-sm text-ink-muted">
                {vs ? (
                    <>
                        <span className={cx('font-bold', vs.up ? 'text-success' : 'text-danger')}>{vs.text}</span> on {month.last_month_name} by this date (
                        {formatKes(month.last_month_same_time_cents)})
                    </>
                ) : (
                    `No sales recorded in ${month.last_month_name} by this date.`
                )}
            </p>
            <dl className="mt-4 grid gap-3 border-t border-line-soft pt-3 text-sm">
                <Row label="Best seller this week">
                    {best ? (
                        <>
                            <span className="font-semibold text-plum">{best.name}</span>
                            <span className="block text-xs text-ink-muted">
                                {quantityLabel(best.quantity, best.unit)} · {formatKes(best.total_cents)}
                            </span>
                        </>
                    ) : (
                        <span className="text-ink-muted">Nothing sold this week</span>
                    )}
                </Row>
                <Row label="Owed to the shop">
                    {month.owing_customers > 0 ? (
                        <Link to="/customers?owing=1" className="hover:underline">
                            <span className="tabular font-semibold text-danger">{formatKes(month.owed_cents)}</span>
                            <span className="block text-xs text-ink-muted">
                                {plural(month.owing_customers, 'customer')}
                                {month.top_debtor && `, most by ${month.top_debtor.name} (${formatKes(month.top_debtor.owed_cents)})`}
                            </span>
                        </Link>
                    ) : (
                        <span className="text-ink-muted">Nobody owes anything</span>
                    )}
                </Row>
            </dl>
        </Card>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    )
}

function RecentSales({ sales }: { sales: HomeSale[] }) {
    return (
        <Card title="Latest sales" action={<Link to="/day-book" className="text-sm font-bold text-rose-dark">Day book</Link>}>
            {sales.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">No sales recorded yet.</p>
            ) : (
                <ul className="-mx-2 divide-y divide-line-soft">
                    {sales.map((s) => {
                        const voided = s.status === 'voided'
                        return (
                            <li key={s.id}>
                                <Link to={`/day-book?date=${s.date}&sale=${s.id}`} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-blush-50">
                                    <span className="min-w-0">
                                        <span className={cx('block truncate text-sm font-semibold', voided ? 'text-ink-muted line-through' : 'text-plum')}>{s.items}</span>
                                        <span className="block truncate text-xs text-ink-muted">
                                            {formatDate(s.date) === formatDate(new Date().toISOString()) ? clock.format(new Date(s.created_at)) : formatDate(s.date)}
                                            {s.customer && ` · ${s.customer}`}
                                            {s.seller && ` · by ${s.seller}`}
                                        </span>
                                    </span>
                                    <span className="flex-none text-right">
                                        <span className={cx('tabular block text-sm font-semibold', voided && 'text-ink-muted line-through')}>{formatKes(s.total_cents)}</span>
                                        <span className="block text-xs text-ink-muted">{voided ? 'Voided' : s.methods.map(methodLabel).join(' + ')}</span>
                                    </span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Card>
    )
}

function WorkCard({ work }: { work: HomeWork[] }) {
    return (
        <Card title="Orders to make" action={<Link to="/orders" className="text-sm font-bold text-rose-dark">All orders</Link>}>
            <ul className="-mx-2 divide-y divide-line-soft">
                {work.map((o) => (
                    <li key={o.id}>
                        <Link to={`/orders?order=${o.id}`} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-blush-50">
                            <span className="min-w-0">
                                <span className="block font-semibold text-plum">{o.customer}</span>
                                <span className="block truncate text-xs text-ink-muted">{o.items}</span>
                            </span>
                            <span className="flex-none text-right text-xs">
                                <span className={cx('block font-semibold', o.overdue ? 'text-danger' : 'text-ink')}>
                                    {o.overdue ? 'Late, was due' : 'Due'} {formatDate(o.due_on)}
                                </span>
                                <span className="text-ink-muted">{o.status === 'taken' ? 'Not started' : 'Being made'}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </Card>
    )
}

function StockSection({ data }: { data: Dashboard }) {
    const canReceive = useCan('receive_stock')
    const canAudit = useCan('view_audit')
    const [params, setParams] = useSearchParams()
    const openReceive = () => {
        const next = new URLSearchParams(params)
        next.set('receive', '1')
        setParams(next)
    }

    return (
        <section className="mt-2 grid gap-4">
            <h2 className="font-display text-xl text-plum">Stock</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Fabric in stock" value={formatMetres(data.balance_cm)} note={plural(data.active_rolls, 'roll')} to="/rolls" icon={RollIcon} />
                <StatCard
                    label="Rolls running low"
                    value={String(data.low_rolls.length)}
                    note="at their alert level"
                    to="/rolls?low=1"
                    icon={AlertTriangleIcon}
                    tone={data.low_rolls.length > 0 ? 'warn' : 'default'}
                />
                <StatCard
                    label="Count corrections today"
                    value={String(data.corrections_today)}
                    note="stock changed by hand"
                    to={canAudit ? '/audit' : undefined}
                    icon={AuditIcon}
                    tone={data.corrections_today > 0 ? 'warn' : 'default'}
                />
                {data.stock_value_cents !== undefined && (
                    <StatCard label="Stock at cost" value={formatKes(data.stock_value_cents)} note="fabric left, at purchase price" icon={BanknoteIcon} />
                )}
            </div>

            {data.active_rolls === 0 ? (
                <EmptyState title="No rolls recorded yet" action={canReceive ? <Button onClick={openReceive}>Receive stock</Button> : undefined}>
                    Start by recording each roll in the shop. Measure it, give it a tag, and the system will track every metre from then on.
                </EmptyState>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className="grid content-start gap-4">
                        {data.low_products.length > 0 && (
                            <Card title="Products running low" action={<Link to="/products?show=low" className="text-sm font-bold text-rose-dark">Products</Link>}>
                                <ul className="divide-y divide-line-soft">
                                    {data.low_products.map((p) => (
                                        <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                                            <span className="truncate font-semibold text-plum">{p.name}</span>
                                            <Pill tone="warn">{quantityLabel(p.quantity, p.unit)} left</Pill>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}
                        <Card title="Fabric by category">
                            <ul className="divide-y divide-line-soft">
                                {data.by_category.map((c) => (
                                    <li key={c.id}>
                                        <Link to={`/rolls?category_id=${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-blush-50">
                                            <span className="font-semibold">{c.name}</span>
                                            <span className="tabular text-right">
                                                <span className="font-semibold">{formatMetres(c.balance_cm)}</span>
                                                <span className="block text-xs text-ink-muted">{plural(c.rolls, 'roll')}</span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        {data.low_rolls.length > 0 && (
                            <Card title="Rolls running low" action={<Link to="/rolls?low=1" className="text-sm font-bold text-rose-dark">See all</Link>}>
                                <div className="grid gap-2">
                                    {data.low_rolls.slice(0, 5).map((r) => (
                                        <RollCard key={r.id} roll={r} />
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>
                    <Card title="Latest stock activity">
                        <ul className="divide-y divide-line-soft">
                            {data.recent_movements.map((m) => (
                                <MovementRow key={m.id} movement={m} showRoll />
                            ))}
                        </ul>
                    </Card>
                </div>
            )}
        </section>
    )
}

type StatTone = 'default' | 'warn' | 'success'

const statTones: Record<StatTone, { icon: string; value: string }> = {
    default: { icon: 'bg-blush-100 text-rose-dark', value: 'text-plum' },
    warn: { icon: 'bg-amber-100 text-amber-800', value: 'text-amber-800' },
    success: { icon: 'bg-success-soft text-success', value: 'text-success' },
}

function StatCard({
    label,
    value,
    note,
    to,
    icon: Icon,
    tone = 'default',
}: {
    label: string
    value: string
    note: string
    to?: string
    icon: (props: IconProps) => React.JSX.Element
    tone?: StatTone
}) {
    const body = (
        <>
            <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink-muted">{label}</span>
                <span className={cx('grid size-9 flex-none place-items-center rounded-full', statTones[tone].icon)}>
                    <Icon size={18} />
                </span>
            </div>
            <strong className={cx('tabular mt-3 block text-2xl tracking-tight break-words', statTones[tone].value)}>{value}</strong>
            <span className="mt-1 block text-xs text-ink-muted">{note}</span>
        </>
    )
    const cls = 'block min-h-32 rounded-2xl border border-line-soft bg-white p-4 shadow-card'
    return to ? (
        <Link to={to} className={cx(cls, 'transition hover:border-plum-300')}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    )
}
