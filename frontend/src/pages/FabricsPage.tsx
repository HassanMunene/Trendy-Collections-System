import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan } from '../auth/useMe'
import { ButtonLink, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pill, Swatch } from '../components/ui'
import { formatKes, formatMetres, plural } from '../lib/units'

export function FabricsPage() {
  const canManage = useCan('manage_catalogue')
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fabrics', { showInactive }],
    queryFn: () => api.fabrics({ include_inactive: showInactive }),
  })

  const term = q.trim().toLowerCase()
  const shown = (data ?? []).filter((f) => !term || `${f.code} ${f.display_name} ${f.category?.name} ${f.shade_code}`.toLowerCase().includes(term))

  return (
    <>
      <PageHeader
        title="Fabrics"
        subtitle="Each fabric design the shop stocks, and how much of it is left across all rolls."
        action={canManage && <ButtonLink to="/fabrics/new">+ New fabric</ButtonLink>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fabrics…" aria-label="Search fabrics" className="sm:max-w-sm" />
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="size-5 accent-rose" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show fabrics no longer sold
        </label>
      </div>

      {isLoading && <Loading />}
      {error && <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />}
      {data && shown.length === 0 && (
        <EmptyState title={data.length ? 'No fabric matches' : 'No fabrics yet'}>
          {data.length ? 'Try another search.' : 'Fabrics are added when you receive the first roll, or with "New fabric".'}
        </EmptyState>
      )}

      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((f) => (
          <li key={f.id}>
            <Link to={`/fabrics/${f.id}`} className="block h-full rounded-xl border border-line-soft bg-white p-3.5 transition hover:border-plum-300 hover:shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-plum">{f.code}</span>
                    {!f.active && <Pill tone="muted">Not sold</Pill>}
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-semibold">
                    <Swatch name={f.colour?.name} />
                    <span className="truncate">{f.display_name}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {[f.category?.name, f.width_cm ? `${f.width_cm} cm wide` : null, f.retail_price_cents_per_m != null ? `${formatKes(f.retail_price_cents_per_m)}/m` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="tabular flex-none text-right">
                  <p className="font-bold text-plum">{formatMetres(f.balance_cm ?? 0)}</p>
                  <p className="text-xs text-ink-muted">{plural(f.rolls_in_stock ?? 0, 'roll')}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
