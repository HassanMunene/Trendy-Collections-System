import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Fabric } from '../api/types'
import { useCan } from '../auth/useMe'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { SwatchIcon } from '../components/icons'
import { FabricDrawer } from '../components/FabricDrawer'
import { Button, ErrorNotice, PageHeader, Pill, Swatch } from '../components/ui'
import { formatKes, formatMetres, plural } from '../lib/units'

const PAGE_SIZE = 10

export function FabricsPage() {
    const canManage = useCan('manage_catalogue')
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const newOpen = canManage && searchParams.get('new') === '1'
    const editId = Number(searchParams.get('edit')) || null
    const [q, setQ] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [page, setPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(PAGE_SIZE)
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['fabrics', { showInactive }],
        queryFn: () => api.fabrics({ include_inactive: showInactive }),
    })

    function openNew() {
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    next.set('new', '1')
    setSearchParams(next)
  }

  function openEdit(id: number) {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.set('edit', String(id))
    setSearchParams(next)
  }

  function closeDrawer() {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }

  const editingFabric = editId ? data?.find((f) => f.id === editId) : undefined

  const term = q.trim().toLowerCase()
    const shown = (data ?? []).filter((f) => !term || `${f.code} ${f.display_name} ${f.category?.name} ${f.shade_code}`.toLowerCase().includes(term))
    const pageCount = Math.max(1, Math.ceil(shown.length / itemsPerPage))
    const safePage = Math.min(page, pageCount)
    const pageRows = shown.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

    const columns: DataTableColumn<Fabric>[] = [
        {
            key: 'code',
            header: 'Code',
            noWrap: true,
            mobile: 'detail',
            render: (f) => (
                <Link to={`/fabrics/${f.id}`} className="font-mono text-sm font-bold text-rose-dark hover:underline">
                    {f.code}
                </Link>
            ),
        },
        {
            key: 'fabric',
            header: 'Fabric',
            mobile: 'title',
            render: (f) => (
                <span className="flex items-center gap-2 font-semibold text-plum">
                    <Swatch name={f.colour?.name} />
                    <span className="truncate">{f.display_name}</span>
                </span>
            ),
        },
        {
            key: 'category',
            header: 'Category',
            headerClassName: 'hidden md:table-cell',
            cellClassName: 'hidden md:table-cell',
            render: (f) => f.category?.name || '—',
        },
        {
            key: 'width',
            header: 'Width',
            align: 'right',
            noWrap: true,
            headerClassName: 'hidden lg:table-cell',
            cellClassName: 'hidden lg:table-cell',
            render: (f) => (f.width_cm ? `${f.width_cm} cm` : '—'),
        },
        {
            key: 'price',
            header: 'Price/m',
            align: 'right',
            noWrap: true,
            headerClassName: 'hidden sm:table-cell',
            cellClassName: 'hidden sm:table-cell',
            render: (f) => (f.retail_price_cents_per_m != null ? formatKes(f.retail_price_cents_per_m) : '—'),
        },
        {
            key: 'balance',
            header: 'In stock',
            align: 'right',
            noWrap: true,
            render: (f) => <span className="font-semibold text-plum">{formatMetres(f.balance_cm ?? 0)}</span>,
        },
        {
            key: 'rolls',
            header: 'Rolls',
            align: 'right',
            noWrap: true,
            headerClassName: 'hidden sm:table-cell',
            cellClassName: 'hidden sm:table-cell',
            render: (f) => plural(f.rolls_in_stock ?? 0, 'roll'),
        },
        {
            key: 'status',
            header: 'Status',
            noWrap: true,
            render: (f) => <Pill tone={f.active ? 'success' : 'muted'}>{f.active ? 'In catalogue' : 'Not sold'}</Pill>,
        },
        ...(canManage
            ? [
                  {
                      key: 'actions',
                      header: 'Actions',
                      align: 'right' as const,
                      noWrap: true,
                      render: (f: Fabric) => (
                          <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => openEdit(f.id)}>
                              Edit
                          </Button>
                      ),
                  },
              ]
            : []),
    ]

    return (
        <>
            <PageHeader
                title="Fabrics"
                subtitle="Each fabric design the shop stocks, and how much of it is left across all rolls."
                action={canManage && <Button onClick={openNew}>+ New fabric</Button>}
            />

            {error && <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />}

            {!error && (
                <DataTable
                    columns={columns}
                    data={pageRows}
                    isLoading={isLoading}
                    rowKey="id"
                    currentPage={safePage}
                    itemsPerPage={itemsPerPage}
                    totalItems={shown.length}
                    onPageChange={setPage}
                    onItemsPerPageChange={(size) => {
                        setItemsPerPage(size)
                        setPage(1)
                    }}
                    onRowClick={(f) => navigate(`/fabrics/${f.id}`)}
                    rowClassName={(f) => (f.active ? '' : 'text-ink-muted')}
                    searchValue={q}
                    onSearchChange={(value) => {
                        setQ(value)
                        setPage(1)
                    }}
                    searchPlaceholder="Search code, name, category…"
                    toolbar={
                        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
                            <input
                                type="checkbox"
                                className="size-5 accent-rose"
                                checked={showInactive}
                                onChange={(event) => {
                                    setShowInactive(event.target.checked)
                                    setPage(1)
                                }}
                            />
                            Show fabrics no longer sold
                        </label>
                    }
                    emptyContent={
                        <div className="flex flex-col items-center gap-2 text-center">
                            <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                                <SwatchIcon />
                            </span>
                            <p className="font-display text-xl text-plum">{data?.length ? 'No fabric matches' : 'No fabrics yet'}</p>
                            <p className="max-w-md text-sm text-ink-muted">
                                {data?.length ? 'Try another search.' : 'Fabrics are added when you receive the first roll, or with "New fabric".'}
                            </p>              {!data?.length && canManage && (
                <Button onClick={openNew} className="mt-2">
                  + New fabric
                </Button>
              )}
                        </div>
                    }        />
      )}

      {newOpen && <FabricDrawer onClose={closeDrawer} />}
      {!newOpen && canManage && editingFabric && <FabricDrawer key={editingFabric.id} fabric={editingFabric} onClose={closeDrawer} />}
    </>
  )
}
