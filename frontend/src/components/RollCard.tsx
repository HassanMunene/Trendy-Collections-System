import { Link } from 'react-router'
import type { Roll } from '../api/types'
import { formatMetres } from '../lib/units'
import { Pill, Swatch } from './ui'

/** One roll as a tappable card; used in lists on every screen size. */
export function RollCard({ roll }: { roll: Roll }) {
  const f = roll.fabric
  const usedPct = roll.received_cm > 0 ? Math.min(100, Math.round((roll.balance_cm / roll.received_cm) * 100)) : 0
  return (
    <Link
      to={`/rolls/${roll.id}`}
      className="block rounded-xl border border-line-soft bg-white p-3.5 transition hover:border-plum-300 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-plum">{roll.tag}</span>
            {roll.is_low && <Pill tone="warn">Low</Pill>}
            {roll.status === 'finished' && <Pill tone="muted">Finished</Pill>}
          </p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
            <Swatch name={f?.colour?.name} />
            <span className="truncate">{f?.display_name ?? 'Fabric'}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {[f?.category?.name, f?.code, roll.location].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="tabular flex-none text-right">
          <p className="text-lg font-bold text-plum">{formatMetres(roll.balance_cm)}</p>
          <p className="text-xs text-ink-muted">of {formatMetres(roll.received_cm)}</p>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-blush-200" aria-hidden>
        <div className={`h-full rounded-full ${roll.is_low ? 'bg-amber-500' : 'bg-rose'}`} style={{ width: `${usedPct}%` }} />
      </div>
    </Link>
  )
}
