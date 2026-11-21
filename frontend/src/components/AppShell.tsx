import { Link, NavLink, Outlet, useSearchParams } from 'react-router'
import { useCan, useCurrentUser } from '../auth/useMe'
import { Avatar } from './Avatar'
import { BoxIcon, HomeIcon, PlusIcon, RollIcon, SwatchIcon, TeamIcon, UserIcon } from './icons'
import { cx } from '../lib/cx'
import { ReceiveChoiceDrawer } from './ReceiveChoiceDrawer'
import { ReceiveRollDrawer } from './ReceiveRollDrawer'
import { StockItemDrawer } from './StockItemDrawer'

interface NavItem {
  to: string
  label: string
  short: string
  icon: () => React.JSX.Element
  end?: boolean
  show: boolean
}

export function AppShell() {
  const me = useCurrentUser()
  const canReceive = useCan('receive_stock')
  const canManageStaff = useCan('manage_staff')
  const [params, setParams] = useSearchParams()

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
    { to: '/rolls/receive', label: 'Receive stock', short: 'Receive', icon: PlusIcon, show: canReceive },
    { to: '/fabrics', label: 'Fabrics', short: 'Fabrics', icon: SwatchIcon, show: true },
    { to: '/stock', label: 'Stock', short: 'Stock', icon: BoxIcon, show: true },
    { to: '/staff', label: 'Staff', short: 'Staff', icon: TeamIcon, show: canManageStaff },
    { to: '/account', label: 'My account', short: 'Me', icon: UserIcon, show: true },
  ].filter((i) => i.show)

  // Phones get at most five tabs; Staff is reachable from "Me" on small screens.
  const mobileItems = items.filter((i) => i.to !== '/staff' && i.to !== '/rolls/receive').slice(0, 5)

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      {/* Laptop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-plum px-3 py-6 text-blush-100 md:flex">
        <Brand light />
        <nav aria-label="Main" className="mt-8 grid gap-1">
          {items.map((item) =>
            item.to === '/rolls/receive' ? (
              <button
                key={item.to}
                type="button"
                onClick={openReceive}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left font-semibold text-blush-300 transition hover:bg-white/10 hover:text-white"
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
                  cx('flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold transition', isActive ? 'bg-white/15 text-white' : 'text-blush-300 hover:bg-white/10 hover:text-white')
                }
              >
                <item.icon />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <Link to="/account" className="mt-auto flex items-center gap-2.5 border-t border-white/15 px-2 pt-4 text-sm transition hover:opacity-90">
          <Avatar name={me.name} url={me.avatar_url} size="xs" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-white">{me.name}</span>
            <span className="block truncate text-blush-300 capitalize">{me.is_superadmin ? 'Superadmin' : me.role}</span>
          </span>
        </Link>
      </aside>

      <div className="min-w-0">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line-soft bg-white/95 px-4 backdrop-blur md:hidden">
          <Brand />
          <Link to="/account" className="flex max-w-[52%] items-center gap-2 text-sm font-semibold text-ink-muted">
            <span className="min-w-0 truncate">{me.name}</span>
            <Avatar name={me.name} url={me.avatar_url} size="xs" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 sm:px-6 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Phone bottom tabs, within thumb reach */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line-soft bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_#3517230f] md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
      >
        {mobileItems.map((item) =>
          item.to === '/rolls/receive' ? (
            <button
              key={item.to}
              type="button"
              onClick={openReceive}
              className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-ink-muted"
            >
              <item.icon />
              {item.short}
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', isActive ? 'text-rose' : 'text-ink-muted')
              }
            >
              <item.icon />
              {item.short}
            </NavLink>
          ),
        )}
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
    </div>
  )
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className={cx('grid size-9 place-items-center rounded-xl font-display text-xl font-bold', light ? 'bg-blush-300 text-plum' : 'bg-plum text-white')}>T</span>
      <div className="leading-tight">
        <p className={cx('font-display text-lg', light ? 'text-white' : 'text-plum')}>Trendy Collections</p>
        {light && <p className="text-[10px] font-bold tracking-[0.14em] text-blush-300 uppercase">Shop system</p>}
      </div>
    </div>
  )
}
