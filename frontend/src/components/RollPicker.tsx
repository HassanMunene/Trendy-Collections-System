import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Roll } from '../api/types'
import { formatKes, formatMetres } from '../lib/units'
import { ErrorNotice, Input, Loading, Swatch } from './ui'

/** Search the rolls in stock and pick one (fabric by the metre, or fabric used in sewing). */
export function RollPicker({ onPick }: { onPick: (roll: Roll) => void }) {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const rolls = useQuery({
    queryKey: ['rolls', 'picker', q],
    queryFn: () => api.rolls({ q: q || undefined, status: 'active' }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="grid gap-3">
      <Input type="search" autoFocus placeholder="Search colour, fabric, roll tag…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search rolls" />
      {rolls.error && <ErrorNotice problem={toProblem(rolls.error)} onRetry={() => rolls.refetch()} />}
      {rolls.isLoading && <Loading />}
      {rolls.data && rolls.data.data.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">No roll in stock matches.</p>}
      <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
        {rolls.data?.data.map((roll) => (
          <li key={roll.id}>
            <button type="button" onClick={() => onPick(roll)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-blush-50">
              <Swatch name={roll.fabric?.colour?.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-plum">{roll.fabric?.display_name ?? roll.tag}</span>
                <span className="block text-xs text-ink-muted">
                  Roll {roll.tag}
                  {roll.fabric?.retail_price_cents_per_m ? ` · ${formatKes(roll.fabric.retail_price_cents_per_m)}/m` : ''}
                </span>
              </span>
              <span className="tabular text-sm font-semibold text-plum">{formatMetres(roll.balance_cm)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
