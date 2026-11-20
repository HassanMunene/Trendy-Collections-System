import { NavLink, Outlet } from 'react-router'
import { useCan, useCurrentUser } from '../auth/useMe'
import { HomeIcon, PlusIcon, RollIcon, SwatchIcon, TeamIcon, UserIcon } from './icons'
import { cx } from '../lib/cx'

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

  const items: NavItem[] = [
    { to: '/', label: 'Home', short: 'Home', icon: HomeIcon, end: true, show: true },
    { to: '/rolls', label: 'Rolls & stock', short: 'Rolls', icon: RollIcon, end: true, show: true },
    { to: '/rolls/receive', label: 'Receive a roll', short: 'Receive', icon: PlusIcon, show: canReceive },
    { to: '/fabrics', label: 'Fabrics', short: 'Fabrics', icon: SwatchIcon, show: true },
    { to: '/staff', label: 'Staff', short: 'Staff', icon: TeamIcon, show: canManageStaff },
    { to: '/account', label: 'My account', short: 'Me', icon: UserIcon, show: true },
  ].filter((i) => i.show)

  // Phones get at most five tabs; Staff is reachable from "Me" on small screens.
  const mobileItems = items.filter((i) => i.to !== '/staff').slice(0, 5)

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      {/* Laptop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-plum px-3 py-6 text-blush-100 md:flex">
        <Brand light />
        <nav aria-label="Main" className="mt-8 grid gap-1">
          {items.map((item) => (
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
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 px-2 pt-4 text-sm">
          <p className="truncate font-semibold text-white">{me.name}</p>
          <p className="truncate text-blush-300 capitalize">{me.is_superadmin ? 'Superadmin' : me.role}</p>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line-soft bg-white/95 px-4 backdrop-blur md:hidden">
          <Brand />
          <span className="max-w-[45%] truncate text-sm font-semibold text-ink-muted">{me.name}</span>
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
        {mobileItems.map((item) => (
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
        ))}
      </nav>
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
