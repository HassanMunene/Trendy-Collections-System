import { Link } from 'react-router'
import type { Movement, MovementKind } from '../api/types'
import { formatChange, formatDateTime, formatMetres } from '../lib/units'
import { cx } from '../lib/cx'

const KIND_LABEL: Record<MovementKind, string> = {
  receipt: 'Received',
  adjustment: 'Count correction',
  cut: 'Cut',
  sale: 'Sold',
  return: 'Returned',
  transfer: 'Moved',
}

export function MovementRow({ movement: m, showRoll = false }: { movement: Movement; showRoll?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={cx('mt-1.5 size-2.5 flex-none rounded-full', m.change_cm > 0 ? 'bg-success' : 'bg-rose')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <strong>{KIND_LABEL[m.kind]}</strong>
          {showRoll && m.roll && (
            <>
              {' · '}
              <Link to={`/rolls/${m.roll.id}`} className="font-semibold text-rose-dark underline-offset-2 hover:underline">
                {m.roll.tag}
              </Link>
            </>
          )}
        </p>
        {m.note && <p className="mt-0.5 text-sm text-ink-muted break-words">“{m.note}”</p>}
        <p className="mt-0.5 text-xs text-ink-muted">
          {m.actor?.name ?? 'Unknown'} · {formatDateTime(m.created_at)}
        </p>
      </div>
      <div className="tabular text-right text-sm">
        <span className={cx('font-bold', m.change_cm > 0 ? 'text-success' : 'text-rose-dark')}>{formatChange(m.change_cm)}</span>
        <span className="block text-xs text-ink-muted">left {formatMetres(m.balance_after_cm)}</span>
      </div>
    </li>
  )
}
