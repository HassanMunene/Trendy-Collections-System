import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan, useCurrentUser } from '../auth/useMe'
import { MovementRow } from '../components/MovementRow'
import { RollCard } from '../components/RollCard'
import {
    AlertTriangleIcon,
    AuditIcon,
    BanknoteIcon,
    CheckCircleIcon,
    InboxIcon,
    RollIcon,
    TrendingUpIcon,
    type IconProps,
} from '../components/icons'
import { Button, Card, EmptyState, ErrorNotice, Loading, Pill } from '../components/ui'
import { cx } from '../lib/cx'
import { formatKes, formatMetres, plural } from '../lib/units'

/** Placeholder payments until the M-Pesa integration lands. */
const demoTransactions = [
    { id: 1, customer: 'Wanjiku M.', phone: '0712 ••• 678', amountCents: 325000, time: '10:42' },
    { id: 2, customer: 'Brian O.', phone: '0723 ••• 145', amountCents: 480000, time: '10:18' },
    { id: 3, customer: 'Amina K.', phone: '0734 ••• 902', amountCents: 160000, time: '09:55' },
    { id: 4, customer: 'Peter N.', phone: '0701 ••• 331', amountCents: 280000, time: '09:12' },
]

const demoMadeTodayCents = demoTransactions.reduce((sum, tx) => sum + tx.amountCents, 0)

function greeting() {
    const hour = Number(new Intl.DateTimeFormat('en-KE', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' }).format(new Date()))
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function DashboardPage() {
    const me = useCurrentUser()
    const canReceive = useCan('receive_stock')
    const isSuperadmin = me.is_superadmin
    const [params, setParams] = useSearchParams()
    const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 })

    const openReceive = () => {
        const next = new URLSearchParams(params)
        next.set('receive', '1')
        setParams(next)
    }

    return (
        <>
            <header className="pt-5 pb-4 sm:pt-7 sm:pb-5">
                <h1 className="font-display text-2xl leading-tight text-plum sm:text-3xl">
                    {greeting()}, {me.name.split(' ')[0]}
                </h1>
                <p className="mt-1 text-sm text-ink-muted">Here is how the shop is doing today.</p>
            </header>

            {isLoading && <Loading />}
            {error && (
                <div className="mt-4">
                    <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
                </div>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                        {isSuperadmin && data.stock_value_cents !== undefined && (
                            <StatCard
                                label="Current stock cost"
                                value={formatKes(data.stock_value_cents)}
                                note="what is left, at purchase price"
                                icon={BanknoteIcon}
                            />
                        )}
                        {isSuperadmin && (
                            <StatCard
                                label="Made today"
                                value={formatKes(demoMadeTodayCents)}
                                note="M-Pesa sales · sample"
                                icon={TrendingUpIcon}
                                tone="success"
                                badge="Demo"
                            />
                        )}
                        <StatCard
                            label="Fabric in stock"
                            value={formatMetres(data.balance_cm)}
                            note={`${plural(data.active_rolls, 'roll')} · ${plural(data.by_category.length, 'category', 'categories')}`}
                            to="/rolls"
                            icon={RollIcon}
                        />
                        <StatCard
                            label="Received this week"
                            value={formatMetres(data.received_this_week.cm)}
                            note={plural(data.received_this_week.rolls, 'roll')}
                            icon={InboxIcon}
                        />
                        <StatCard
                            label="Running low"
                            value={String(data.low_rolls.length)}
                            note={data.low_rolls.length === 1 ? 'roll at its alert level' : 'rolls at their alert level'}
                            to="/rolls?low=1"
                            icon={AlertTriangleIcon}
                            tone={data.low_rolls.length > 0 ? 'warn' : 'default'}
                        />
                        <StatCard
                            label="Corrections today"
                            value={String(data.corrections_today)}
                            note="stock count changes"
                            icon={AuditIcon}
                        />
                    </div>

                    <div className="mt-4">
                        <Card title="Recent transactions" action={<Pill tone="warn">Demo · M-Pesa soon</Pill>}>
                            <ul className="divide-y divide-line-soft">
                                {demoTransactions.map((tx) => (
                                    <li key={tx.id} className="flex items-center gap-3 py-3">
                                        <span className="grid size-9 flex-none place-items-center rounded-full bg-success-soft text-success">
                                            <CheckCircleIcon size={18} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-plum">{tx.customer}</p>
                                            <p className="text-xs text-ink-muted">
                                                {tx.time} · {tx.phone}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            {isSuperadmin ? (
                                                <span className="tabular block text-sm font-bold text-plum">{formatKes(tx.amountCents)}</span>
                                            ) : (
                                                <span className="block text-sm font-semibold text-success">Paid</span>
                                            )}
                                            <span className="block text-xs text-ink-muted">M-Pesa</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-ink-muted">
                                Sample transactions. M-Pesa will fill this in automatically once it is connected.
                            </p>
                        </Card>
                    </div>

                    {data.active_rolls === 0 ? (
                        <div className="mt-4">
                            <EmptyState
                                title="No rolls recorded yet"
                                action={canReceive ? <Button onClick={openReceive}>Receive stock</Button> : undefined}
                            >
                                Start by recording each roll in the shop. Measure it, give it a tag, and the system will track every metre from then on.
                            </EmptyState>
                        </div>
                    ) : (
                        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <div className="grid content-start gap-4">
                                <Card title="Stock by category">
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
                                    <Card title="Running low" action={<Link to="/rolls?low=1" className="text-sm font-bold text-rose-dark">See all</Link>}>
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
                </>
            )}
        </>
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
    badge,
}: {
    label: string
    value: string
    note: string
    to?: string
    icon: (props: IconProps) => React.JSX.Element
    tone?: StatTone
    badge?: string
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
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                {badge && <Pill tone="warn">{badge}</Pill>}
                <span>{note}</span>
            </span>
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
