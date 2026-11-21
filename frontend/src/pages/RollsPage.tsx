import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan } from '../auth/useMe'
import { SearchIcon } from '../components/icons'
import { RollCard } from '../components/RollCard'
import { Button, EmptyState, ErrorNotice, Input, Loading, PageHeader, Select } from '../components/ui'
import { cx } from '../lib/cx'
import { plural } from '../lib/units'
import { useLookups } from '../lib/useLookups'

export function RollsPage() {
  const canReceive = useCan('receive_stock')
  const [params, setParams] = useSearchParams()
  const lookups = useLookups()
  const [search, setSearch] = useState(params.get('q') ?? '')

  const q = params.get('q') ?? ''
  const categoryId = params.get('category_id') ?? ''
  const fabricId = params.get('fabric_id') ?? ''
  const low = params.get('low') === '1'
  const status = params.get('status') ?? 'active'
  const sort = params.get('sort') ?? 'newest'
  const page = Number(params.get('page') ?? '1')

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Search as you type, but wait until typing pauses.
  useEffect(() => {
    if (search === q) return
    const t = setTimeout(() => update({ q: search.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const query = useQuery({
    queryKey: ['rolls', { q, categoryId, fabricId, low, status, sort, page }],
    queryFn: () =>
      api.rolls({ q: q || undefined, category_id: categoryId || undefined, fabric_id: fabricId || undefined, low: low ? 1 : undefined, status, sort, page }),
    placeholderData: keepPreviousData,
  })

  const filtersActive = Boolean(q || categoryId || fabricId || low || status !== 'active')

  const openReceive = () => {
    const next = new URLSearchParams(params)
    next.set('receive', '1')
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title="Rolls & stock"
        subtitle={query.data ? `${plural(query.data.meta.total, 'roll')}${status === 'active' ? ' in stock' : ''}` : ' '}
        action={canReceive && <Button onClick={openReceive}>+ Receive stock</Button>}
      />

      {fabricId && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-blush-200 px-3 py-2 text-sm">
          <span>Showing rolls of one fabric only.</span>
          <Button variant="ghost" className="min-h-8 px-2 text-sm" onClick={() => update({ fabric_id: null })}>
            Show all
          </Button>
        </div>
      )}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line-soft bg-blush-100/95 px-4 pt-1 pb-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:p-3 md:top-0">
        <label className="relative block">
          <span className="sr-only">Search rolls</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <SearchIcon />
          </span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tag, colour, material, supplier…"
            className="pl-10"
            autoComplete="off"
          />
        </label>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
          <Chip active={!categoryId} onClick={() => update({ category_id: null })}>
            All
          </Chip>
          {lookups.data?.categories.map((c) => (
            <Chip key={c.id} active={categoryId === String(c.id)} onClick={() => update({ category_id: String(c.id) })}>
              {c.name}
            </Chip>
          ))}
          <Chip active={low} onClick={() => update({ low: low ? null : '1' })} tone="warn">
            Running low
          </Chip>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select aria-label="Show" value={status} onChange={(e) => update({ status: e.target.value === 'active' ? null : e.target.value })} className="min-h-10 py-1.5 text-sm">
            <option value="active">In stock</option>
            <option value="finished">Finished</option>
            <option value="all">All rolls</option>
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value })} className="min-h-10 py-1.5 text-sm">
            <option value="newest">Newest first</option>
            <option value="balance_asc">Least left first</option>
            <option value="balance_desc">Most left first</option>
            <option value="tag">By tag</option>
          </Select>
        </div>
      </div>

      {query.isLoading && <Loading />}
      {query.error && <ErrorNotice problem={toProblem(query.error)} onRetry={() => query.refetch()} />}

      {query.data && query.data.data.length === 0 && (
        <EmptyState
          title={filtersActive ? 'No rolls match' : 'No rolls yet'}
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={() => { setSearch(''); setParams({}, { replace: true }) }}>
                Clear filters
              </Button>
            ) : canReceive ? (
              <Button onClick={openReceive}>Receive stock</Button>
            ) : undefined
          }
        >
          {filtersActive ? 'Try a different search or filter.' : 'Rolls appear here once they are received.'}
        </EmptyState>
      )}

      {query.data && query.data.data.length > 0 && (
        <>
          <div className={cx('grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3', query.isFetching && 'opacity-70')}>
            {query.data.data.map((roll) => (
              <RollCard key={roll.id} roll={roll} />
            ))}
          </div>
          {query.data.meta.last_page > 1 && (
            <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Pages">
              <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                ← Previous
              </Button>
              <span className="text-sm text-ink-muted">
                Page {page} of {query.data.meta.last_page}
              </span>
              <Button variant="secondary" disabled={page >= query.data.meta.last_page} onClick={() => update({ page: String(page + 1) })}>
                Next →
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

function Chip({ active, onClick, children, tone = 'default' }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'min-h-9 flex-none rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition',
        active
          ? tone === 'warn'
            ? 'border-amber-600 bg-amber-100 text-amber-900'
            : 'border-plum bg-plum text-white'
          : 'border-line bg-white text-ink-muted hover:border-plum-300',
      )}
    >
      {children}
    </button>
  )
}
