import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { StockItem } from '../api/types'
import { useCan } from '../auth/useMe'
import { BoxIcon } from '../components/icons'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Button, ErrorNotice, PageHeader, Pill } from '../components/ui'
import { formatKes } from '../lib/units'

export function StockPage() {
  const canReceive = useCan('receive_stock')
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [page, setPage] = useState(1)

  const q = params.get('q') ?? ''
  const low = params.get('low') === '1'

  const query = useQuery({
    queryKey: ['stock-items', { q, low, page }],
    queryFn: () => api.stockItems({ q: q || undefined, low: low ? 1 : undefined, page }),
    placeholderData: keepPreviousData,
  })

  // Search as you type, but wait until typing pauses.
  useEffect(() => {
    if (search === q) return
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      setParams(next, { replace: true })
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const openReceive = () => {
    const next = new URLSearchParams(params)
    next.set('receive', 'item')
    setParams(next)
  }

  const columns: DataTableColumn<StockItem>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <div className="min-w-0">
          <p className="font-semibold text-plum">{item.name}</p>
          <p className="text-xs text-ink-muted">{item.sku ?? 'No code'}</p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'On hand',
      align: 'right',
      noWrap: true,
      render: (item) => (
        <span className="tabular font-semibold text-plum">
          {item.quantity} <span className="font-normal text-ink-muted">{item.unit}</span>
        </span>
      ),
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      noWrap: true,
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      render: (item) => (item.reorder_level === null ? '—' : `${item.reorder_level} ${item.unit}`),
    },
    {
      key: 'location',
      header: 'Kept at',
      noWrap: true,
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      render: (item) => item.location,
    },
    {
      key: 'cost',
      header: 'Value (cost)',
      align: 'right',
      noWrap: true,
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      render: (item) => (item.cost_cents !== undefined ? formatKes(item.cost_cents) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      noWrap: true,
      render: (item) => (item.is_low ? <Pill tone="warn">Running low</Pill> : <Pill tone="success">In stock</Pill>),
    },
  ]

  const items = query.data?.data ?? []
  const meta = query.data?.meta

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Hangers, trims, lining and other shop stock that is not a fabric roll."
        action={
          canReceive && (
            <Button onClick={openReceive}>
              <BoxIcon />
              Receive stock
            </Button>
          )
        }
      />

      {query.error && <ErrorNotice problem={toProblem(query.error)} onRetry={() => query.refetch()} />}

      {!query.error && (
        <DataTable
          columns={columns}
          data={items}
          isLoading={query.isLoading}
          rowKey="id"
          currentPage={page}
          itemsPerPage={meta?.per_page ?? 50}
          totalItems={meta?.total ?? 0}
          onPageChange={setPage}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder="Search name, code, supplier…"
          toolbar={
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="size-5 accent-rose"
                checked={low}
                onChange={(event) => {
                  const next = new URLSearchParams(params)
                  if (event.target.checked) next.set('low', '1')
                  else next.delete('low')
                  setParams(next, { replace: true })
                  setPage(1)
                }}
              />
              Running low only
            </label>
          }
          emptyContent={
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                <BoxIcon />
              </span>
              <p className="font-display text-xl text-plum">{q || low ? 'No stock matches' : 'No extra stock yet'}</p>
              <p className="max-w-md text-sm text-ink-muted">
                {q || low
                  ? 'Try another search or clear the running low filter.'
                  : 'Record hangers, trims, lining and other shop items here so their levels are tracked too.'}
              </p>
              {!q && !low && canReceive && (
                <Button onClick={openReceive} className="mt-2">
                  Receive stock
                </Button>
              )}
            </div>
          }
        />
      )}
    </>
  )
}
