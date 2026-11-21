import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan, useCurrentUser } from '../auth/useMe'
import { MovementRow } from '../components/MovementRow'
import { RollCard } from '../components/RollCard'
import { PlusIcon, SearchIcon, SwatchIcon } from '../components/icons'
import { Button, Card, EmptyState, ErrorNotice, Loading } from '../components/ui'
import { cx } from '../lib/cx'
import { formatKes, formatMetres, plural } from '../lib/units'

type QuickActionTone = 'rose' | 'emerald' | 'indigo'

const quickActionTones: Record<QuickActionTone, string> = {
  rose: 'from-rose to-rose-dark',
  emerald: 'from-emerald-500 to-emerald-700',
  indigo: 'from-indigo-500 to-indigo-700',
}

function greeting() {
    const hour = Number(new Intl.DateTimeFormat('en-KE', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' }).format(new Date()))
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function DashboardPage() {
    const me = useCurrentUser()
    const canReceive = useCan('receive_stock')
    const [params, setParams] = useSearchParams()
    const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 60_000 })

    const openReceive = () => {
        const next = new URLSearchParams(params)
        next.set('receive', '1')
        setParams(next)
    }

    // Add new shortcuts here; push into the array (or spread a condition) to gate one by permission.
    const quickActions: { label: string; hint: string; to?: string; receive?: boolean; Icon: typeof PlusIcon; tone: QuickActionTone }[] = [
        ...(canReceive ? [{ label: 'Receive stock', hint: 'Record stock coming in', receive: true, Icon: PlusIcon, tone: 'rose' as const }] : []),
        { label: 'Find a roll', hint: 'Search by tag, fabric or colour', to: '/rolls', Icon: SearchIcon, tone: 'emerald' },
        { label: 'Browse fabrics', hint: 'Catalogue and stock levels', to: '/fabrics', Icon: SwatchIcon, tone: 'indigo' },
    ]

    function renderQuickAction(action: (typeof quickActions)[number]) {
        const body = (
            <>
                <span className="grid size-10 flex-none place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25">
                    <action.Icon />
                </span>
                <span className="min-w-0">
                    <span className="block font-semibold">{action.label}</span>
                    <span className="block text-xs text-white/80">{action.hint}</span>
                </span>
            </>
        )
        const cls = cx(
            'flex h-full w-full items-center gap-3 rounded-xl bg-gradient-to-br p-3 text-left text-white shadow-sm transition hover:shadow-md hover:brightness-110',
            quickActionTones[action.tone],
        )
        return action.receive ? (
            <button type="button" onClick={openReceive} className={cls}>
                {body}
            </button>
        ) : (
            <Link to={action.to ?? '/'} className={cls}>
                {body}
            </Link>
        )
    }

    return (
        <>
            <div className="mt-5 grid gap-3 sm:mt-7 lg:grid-cols-2">
                <section className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-plum via-[#7a3459] to-rose p-6 text-white shadow-lg sm:p-8">
                    <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full border border-white/15 shadow-[0_0_0_44px_#ffffff08,0_0_0_88px_#ffffff06]" />
                    <div className="relative">
                        <p className="text-xs font-bold tracking-[0.16em] text-blush-300 uppercase">{greeting()}</p>
                        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{me.name.split(' ')[0]}, here is the shop today.</h1>
                        <p className="mt-2 max-w-sm text-sm text-blush-100/80">Everything you need to keep the shelves counted and the rolls moving.</p>
                    </div>
                </section>

                <Card title="Quick actions" className="h-full">
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {quickActions.map((action) => (
                            <li key={action.label}>{renderQuickAction(action)}</li>
                        ))}
                    </ul>
                </Card>
            </div>

            {isLoading && <Loading />}
            {error && (
                <div className="mt-4">
                    <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
                </div>
            )}

            {data && (
                <>
                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Metric label="Fabric in stock" value={formatMetres(data.balance_cm)} note={plural(data.active_rolls, 'roll')} to="/rolls" />
                        <Metric label="Received this week" value={formatMetres(data.received_this_week.cm)} note={plural(data.received_this_week.rolls, 'roll')} />
                        <Metric label="Running low" value={String(data.low_rolls.length)} note={data.low_rolls.length === 1 ? 'roll at its alert level' : 'rolls at their alert level'} to="/rolls?low=1" warn={data.low_rolls.length > 0} />
                        {data.stock_value_cents !== undefined ? (
                            <Metric label="Stock value (cost)" value={formatKes(data.stock_value_cents)} note="what is left, at purchase price" />
                        ) : (
                            <Metric label="Corrections today" value={String(data.corrections_today)} note="stock count changes" />
                        )}
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

function Metric({ label, value, note, to, warn = false }: { label: string; value: string; note: string; to?: string; warn?: boolean }) {
    const body = (
        <>
            <span className="block text-sm font-semibold text-ink-muted">{label}</span>
            <strong className={`tabular mt-2 block text-2xl tracking-tight break-words sm:text-[1.7rem] ${warn ? 'text-amber-700' : 'text-plum'}`}>{value}</strong>
            <span className="mt-0.5 block text-xs text-ink-muted">{note}</span>
        </>
    )
    const cls = 'block min-h-28 rounded-2xl border border-line-soft bg-white p-4 shadow-card'
    return to ? (
        <Link to={to} className={`${cls} hover:border-plum-300`}>
            {body}
        </Link>
    ) : (        <div className={cls}>{body}</div>
    )
}
