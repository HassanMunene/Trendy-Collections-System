import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { useIdleLogout } from '../auth/useIdleLogout'
import { useLivePermissions } from '../auth/useLivePermissions'
import { useCan, useCurrentUser } from '../auth/useMe'
import { Avatar } from './Avatar'
import { AuditIcon, BoxIcon, HomeIcon, PlusGlyphIcon, PlusIcon, RollIcon, SwatchIcon, TeamIcon, TruckIcon, UserIcon, type IconProps } from './icons'
import { cx } from '../lib/cx'
import { ReceiveChoiceDrawer } from './ReceiveChoiceDrawer'
import { ReceiveRollDrawer } from './ReceiveRollDrawer'
import { StockItemDrawer } from './StockItemDrawer'
import { UserMenuDialog } from './UserMenuDialog'

interface NavItem {
    to: string
    label: string
    short: string
    icon: (props: IconProps) => React.JSX.Element
    end?: boolean
    show: boolean
}

const RECEIVE_PATH = '/rolls/receive'

// Shared keyboard focus ring for every interactive element in the shell.
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose'
// On the dark plum sidebar the rose outline is low-contrast, so use a light one there.
const focusRingLight = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blush-300'

export function AppShell() {
    const me = useCurrentUser()
    useIdleLogout(me.session_lifetime_seconds)
    useLivePermissions()
    const canReceive = useCan('receive_stock')
    const canManageStaff = useCan('manage_staff')
    const canManageCatalogue = useCan('manage_catalogue')
    const canViewAudit = useCan('view_audit')
    const [params, setParams] = useSearchParams()
    const { pathname } = useLocation()
    const [userMenuOpen, setUserMenuOpen] = useState(false)

    // The receive form lives in a drawer opened from anywhere via ?receive=1.
    const openReceive = () => {
        const next = new URLSearchParams(params)
        next.set('receive', '1')
        setParams(next)
    }
    const closeReceive = () => {
        const next = new URLSearchParams(params)
        next.delete('receive')
        next.delete('receive_fabric')
        setParams(next, { replace: true })
    }

    const items: NavItem[] = [
        { to: '/', label: 'Home', short: 'Home', icon: HomeIcon, end: true, show: true },
        { to: '/rolls', label: 'Rolls & stock', short: 'Rolls', icon: RollIcon, end: true, show: true },
        { to: RECEIVE_PATH, label: 'Receive stock', short: 'Receive', icon: PlusIcon, show: canReceive },
        { to: '/fabrics', label: 'Fabrics', short: 'Fabrics', icon: SwatchIcon, show: true },
        { to: '/stock', label: 'Stock', short: 'Stock', icon: BoxIcon, show: true },
        { to: '/suppliers', label: 'Suppliers', short: 'Suppliers', icon: TruckIcon, show: canManageCatalogue },
        { to: '/staff', label: 'Users & roles', short: 'Users', icon: TeamIcon, show: canManageStaff },
        { to: '/audit', label: 'Audit log', short: 'Audit', icon: AuditIcon, show: canViewAudit },
        { to: '/account', label: 'My account', short: 'Me', icon: UserIcon, show: true },
    ].filter((i) => i.show)

    // Phones get at most five tabs; Staff is reachable from "Me" and Receive from the header button.
    const mobileItems = items.filter((i) => i.to !== '/staff' && i.to !== RECEIVE_PATH).slice(0, 5)

    // Header title: the longest nav path that matches the current location (so /rolls/123 -> "Rolls & stock").
    const pageTitle =
        items
            .filter((i) => i.to !== RECEIVE_PATH)
            .sort((a, b) => b.to.length - a.to.length)
            .find((i) => (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(i.to + '/')))?.label ?? 'Trendy Collections'

    return (
        <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
            {/* Laptop / tablet sidebar */}
            <aside className="sticky top-0 hidden h-dvh flex-col bg-plum px-3 py-6 text-blush-100 md:flex">
                <Brand light />
                <nav aria-label="Main" className="mt-8 grid gap-1">
                    {items.map((item) =>
                        item.to === RECEIVE_PATH ? (
                            <button
                                key={item.to}
                                type="button"
                                onClick={openReceive}
                                className={cx(
                                    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left font-semibold text-blush-300 transition hover:bg-white/10 hover:text-white',
                                    focusRingLight,
                                )}
                            >
                                <item.icon />
                                {item.label}
                            </button>
                        ) : (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    cx(
                                        'flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold transition',
                                        isActive ? 'bg-white/15 text-white' : 'text-blush-300 hover:bg-white/10 hover:text-white',
                                        focusRingLight,
                                    )
                                }
                            >
                                <item.icon />
                                {item.label}
                            </NavLink>
                        ),
                    )}
                </nav>
                <button
                    type="button"
                    onClick={() => setUserMenuOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={userMenuOpen}
                    className={cx(
                        'mt-auto flex w-full items-center gap-2.5 rounded-lg border-t border-white/15 px-2 pt-4 text-left text-sm transition hover:opacity-90',
                        focusRingLight,
                    )}
                >
                    <Avatar name={me.name} url={me.avatar_url} size="xs" />
                    <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{me.name}</span>
                        <span className="block truncate text-blush-300">{me.is_superadmin ? 'Superadmin' : me.role_label}</span>
                    </span>
                </button>
            </aside>

            <div className="min-w-0">
                {/* Top bar: page title + primary action on every breakpoint; brand mark and avatar on phones only */}
                <header className="sticky top-0 z-30 border-b border-line-soft bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
                    <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 md:h-16 md:px-8">
                        <Link to="/" aria-label="Home" className={cx('shrink-0 rounded-xl md:hidden', focusRing)}>
                            <BrandMark />
                        </Link>

                        <h1 className="min-w-0 flex-1 truncate font-display text-lg text-plum md:text-xl">{pageTitle}</h1>

                        {canReceive && (
                            <button
                                type="button"
                                onClick={openReceive}
                                aria-label="Receive stock"
                                className={cx(
                                    'inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full bg-rose text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-95 md:size-auto md:min-h-10 md:rounded-lg md:px-4',
                                    focusRing,
                                )}
                            >
                                <PlusGlyphIcon />
                                <span className="hidden md:inline">Receive stock</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setUserMenuOpen(true)}
                            aria-label="Account menu"
                            aria-haspopup="dialog"
                            aria-expanded={userMenuOpen}
                            className={cx('-mr-1 grid size-11 shrink-0 place-items-center rounded-full transition hover:opacity-90 md:hidden', focusRing)}
                        >
                            <Avatar name={me.name} url={me.avatar_url} size="md" eager className="ring-line-soft" />
                        </button>
                    </div>
                </header>

                <main className="mx-auto w-full max-w-7xl px-4 pb-28 sm:px-6 md:px-8 md:pb-10">
                    <Outlet />
                </main>
            </div>

            {/* Phone bottom tabs, within thumb reach */}
            <nav
                aria-label="Main"
                className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line-soft bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_#3517230f] md:hidden"
                style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
            >
                {mobileItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            cx(
                                'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold',
                                isActive ? 'text-rose' : 'text-ink-muted',
                                focusRing,
                            )
                        }
                    >
                        <item.icon />
                        {item.short}
                    </NavLink>
                ))}
            </nav>

            {params.get('receive') === '1' && (
                <ReceiveChoiceDrawer
                    onClose={closeReceive}
                    onChoose={(kind) => {
                        const next = new URLSearchParams(params)
                        next.set('receive', kind)
                        setParams(next, { replace: true })
                    }}
                />
            )}
            {params.get('receive') === 'roll' && <ReceiveRollDrawer onClose={closeReceive} presetFabricId={params.get('receive_fabric') ?? ''} />}
            {params.get('receive') === 'item' && <StockItemDrawer onClose={closeReceive} />}

            <UserMenuDialog open={userMenuOpen} onClose={() => setUserMenuOpen(false)} />
        </div>
    )
}

export function BrandMark({ light = false, className }: { light?: boolean; className?: string }) {
    return (
        <span
            className={cx(
                'grid size-9 place-items-center rounded-xl font-display text-xl font-bold',
                light ? 'bg-blush-300 text-plum' : 'bg-plum text-white',
                className,
            )}
        >
            T
        </span>
    )
}

export function Brand({ light = false }: { light?: boolean }) {
    return (
        <div className="flex items-center gap-2.5 px-1">
            <BrandMark light={light} />
            <div className="leading-tight">
                <p className={cx('font-display text-lg', light ? 'text-white' : 'text-plum')}>Trendy Collections</p>
                {light && <p className="text-[10px] font-bold tracking-[0.14em] text-blush-300 uppercase">Shop system</p>}
            </div>
        </div>
    )
}
