import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import type { StockItem } from '../api/types'
import { useCan } from '../auth/useMe'
import { SearchIcon, TagIcon, XMarkIcon } from '../components/icons'
import { ProductDrawer } from '../components/ProductDrawer'
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, PageHeader, Pill, Select, Swatch } from '../components/ui'
import { cx } from '../lib/cx'
import { quantityLabel, useProductCategories, useProducts } from '../lib/useCatalogue'
import { formatKes } from '../lib/units'

type StockFilter = 'all' | 'low' | 'out' | 'hidden'

const STOCK_FILTERS: { key: StockFilter; label: string; short: string }[] = [
  { key: 'all', label: 'All', short: 'All' },
  { key: 'low', label: 'Running low', short: 'Low' },
  { key: 'out', label: 'Out of stock', short: 'Out' },
  { key: 'hidden', label: 'Hidden', short: 'Hidden' },
]

type SortKey = 'kind' | 'name' | 'stock' | 'price_high' | 'price_low'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'kind', label: 'By kind' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'stock', label: 'Fewest on shelf' },
  { key: 'price_high', label: 'Price: high to low' },
  { key: 'price_low', label: 'Price: low to high' },
]

/** With every kind showing, each kind previews this many products; "See all" opens the rest. */
const GROUP_PREVIEW = 6
/** A single kind or a sorted list loads this many at a time. */
const PAGE_SIZE = 30

const matchesStock = (p: StockItem, filter: StockFilter) => {
  if (filter === 'hidden') return !p.active
  if (!p.active) return false
  if (filter === 'low') return p.is_low
  if (filter === 'out') return p.tracks_stock && p.quantity === 0
  return true
}

/** Finished goods for sale, grouped the way the shop thinks of them. */
export function ProductsPage() {
  const canAdd = useCan('manage_catalogue')
  // Everything, hidden included, so counts and the "Hidden" view need no second request.
  const products = useProducts(true)
  const categories = useProductCategories()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<StockItem | 'new' | null>(null)

  // Filters live in the address so Back, refresh and shared links keep them.
  const search = params.get('q') ?? ''
  const categoryId = params.get('kind') ? Number(params.get('kind')) : null
  const stock = (STOCK_FILTERS.find((f) => f.key === params.get('show'))?.key ?? 'all') as StockFilter
  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  // The box keeps its own text so fast typing never drops letters; the address follows after a pause.
  const [searchInput, setSearchInput] = useState(search)
  useEffect(() => {
    if (searchInput.trim() === search) return
    const t = setTimeout(() => setFilter('q', searchInput.trim() || null), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])
  const clearSearch = () => {
    setSearchInput('')
    setFilter('q', null)
  }
  const clearAll = () => {
    setSearchInput('')
    setParams(new URLSearchParams(), { replace: true })
  }
  const sort = (SORTS.find((o) => o.key === params.get('sort'))?.key ?? 'kind') as SortKey
  const filtering = search !== '' || categoryId !== null || stock !== 'all' || sort !== 'kind'
  // Long lists load in pages; any filter change starts again from the first page.
  const [limit, setLimit] = useState(PAGE_SIZE)
  const filterKey = `${search}|${categoryId}|${stock}|${sort}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setLimit(PAGE_SIZE)
  }

  const words = useMemo(() => search.toLowerCase().split(/\s+/).filter(Boolean), [search])
  const matchesSearch = useCallback(
    (p: StockItem) => words.every((w) => p.name.toLowerCase().includes(w) || (p.sku ?? '').toLowerCase().includes(w)),
    [words],
  )

  const all = useMemo(() => products.data ?? [], [products.data])
  const visible = useMemo(
    () => all.filter((p) => (categoryId === null || p.category?.id === categoryId) && matchesStock(p, stock) && matchesSearch(p)),
    [all, categoryId, stock, matchesSearch],
  )

  // Counts follow the other filters, so each number says what tapping it would show.
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const p of all) if (p.category && matchesStock(p, stock) && matchesSearch(p)) counts.set(p.category.id, (counts.get(p.category.id) ?? 0) + 1)
    return counts
  }, [all, stock, matchesSearch])
  const stockCounts = useMemo(() => {
    const inScope = all.filter((p) => (categoryId === null || p.category?.id === categoryId) && matchesSearch(p))
    return Object.fromEntries(STOCK_FILTERS.map((f) => [f.key, inScope.filter((p) => matchesStock(p, f.key)).length])) as Record<StockFilter, number>
  }, [all, categoryId, matchesSearch])

  // Only kinds the shop actually stocks are offered (plus the selected one, so it can be cleared).
  const kinds = (categories.data ?? []).filter((c) => all.some((p) => p.category?.id === c.id) || c.id === categoryId)
  const selectedCategory = categories.data?.find((c) => c.id === categoryId)

  const sorted = useMemo(() => {
    const list = [...visible]
    const name = (p: StockItem) => p.name.toLowerCase()
    if (sort === 'name') list.sort((a, b) => name(a).localeCompare(name(b)))
    if (sort === 'stock') list.sort((a, b) => Number(!a.tracks_stock) - Number(!b.tracks_stock) || a.quantity - b.quantity || name(a).localeCompare(name(b)))
    if (sort === 'price_high') list.sort((a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1))
    if (sort === 'price_low') list.sort((a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity))
    return list
  }, [visible, sort])

  // Grouped by kind only when looking at every kind in the default order; otherwise one flat, paged list.
  const grouped = sort === 'kind' && categoryId === null
  const groups = useMemo(() => {
    const byCategory = new Map<string, { id: number | null; items: StockItem[] }>()
    for (const p of sorted) {
      const key = p.category?.name ?? 'Other'
      const group = byCategory.get(key) ?? { id: p.category?.id ?? null, items: [] }
      group.items.push(p)
      byCategory.set(key, group)
    }
    return [...byCategory.entries()]
  }, [sorted])

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="What the shop sells: asking prices and what is on the shelf."
        action={
          canAdd && (
            <Button onClick={() => setOpen('new')}>
              <TagIcon />
              Add product
            </Button>
          )
        }
      />

      {all.length > 0 && (
        <section aria-label="Filters" className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-line-soft bg-white p-3 shadow-card sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative lg:flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                <SearchIcon />
              </span>
              <Input
                type="search"
                placeholder="Search colour, type or code…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden"
                aria-label="Search products"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-lg text-ink-muted hover:bg-blush-100 hover:text-plum"
                >
                  <XMarkIcon className="size-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:contents">
              <Field label="Kind" className="lg:w-52">
                {(a) => (
                  <Select {...a} value={categoryId ?? ''} onChange={(e) => setFilter('kind', e.target.value || null)}>
                    <option value="">All kinds ({[...categoryCounts.values()].reduce((x, y) => x + y, 0)})</option>
                    {kinds.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({categoryCounts.get(c.id) ?? 0})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Stock" className="lg:w-48">
                {(a) => (
                  <Select {...a} value={stock} onChange={(e) => setFilter('show', e.target.value === 'all' ? null : e.target.value)}>
                    {STOCK_FILTERS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} ({stockCounts[f.key]})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Sort" className="col-span-2 sm:col-span-1 lg:w-48">
                {(a) => (
                  <Select {...a} value={sort} onChange={(e) => setFilter('sort', e.target.value === 'kind' ? null : e.target.value)}>
                    {SORTS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>

          <div className="flex min-h-10 flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-sm">
            <span className="text-ink-muted">
              Showing <strong className="text-plum">{visible.length}</strong> of {all.filter((p) => p.active).length} products
            </span>
            {!filtering && stockCounts.low > 0 && (
              <button type="button" onClick={() => setFilter('show', 'low')} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-200">
                {stockCounts.low} running low
              </button>
            )}
            {filtering && (
              <>
                {selectedCategory && <FilterTag label={selectedCategory.name} onRemove={() => setFilter('kind', null)} />}
                {stock !== 'all' && <FilterTag label={STOCK_FILTERS.find((f) => f.key === stock)!.label} onRemove={() => setFilter('show', null)} />}
                {search && <FilterTag label={`“${search}”`} onRemove={clearSearch} />}
                {sort !== 'kind' && <FilterTag label={SORTS.find((o) => o.key === sort)!.label} onRemove={() => setFilter('sort', null)} />}
                <button type="button" onClick={clearAll} className="-my-1 ml-auto min-h-10 rounded-lg px-3 font-semibold text-rose-dark hover:bg-blush-100">
                  Clear all
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {products.error && <ErrorNotice problem={toProblem(products.error)} onRetry={() => products.refetch()} />}
      {products.isLoading && <Loading />}

      {products.data && visible.length === 0 && (
        <EmptyState
          title={products.data.length === 0 ? 'No products yet' : 'Nothing matches these filters'}
          action={
            products.data.length === 0 ? (
              canAdd ? <Button onClick={() => setOpen('new')}>Add the first product</Button> : undefined
            ) : (
              <Button variant="secondary" onClick={clearAll}>
                Clear all filters
              </Button>
            )
          }
        >
          {products.data.length === 0
            ? 'Add each curtain colour, sheer, pillow case and rod the shop sells, with its asking price. Then they can be sold from the Sell screen.'
            : 'Try a different word, kind or stock filter.'}
        </EmptyState>
      )}

      {grouped ? (
        <div className="grid gap-6">
          {groups.map(([name, group]) => (
            <section key={name}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl text-plum">
                  {name} <span className="font-sans text-sm text-ink-muted">({group.items.length})</span>
                </h2>
                {group.items.length > GROUP_PREVIEW && group.id !== null && (
                  <button type="button" onClick={() => setFilter('kind', String(group.id))} className="min-h-10 rounded-lg px-2 text-sm font-semibold text-rose-dark hover:bg-blush-100">
                    See all {group.items.length} →
                  </button>
                )}
              </div>
              <ProductGrid products={group.items.slice(0, GROUP_PREVIEW)} onOpen={setOpen} />
            </section>
          ))}
        </div>
      ) : (
        <>
          <ProductGrid products={sorted.slice(0, limit)} onOpen={setOpen} showKind={categoryId === null} />
          {sorted.length > limit && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, sorted.length - limit)} more
              </Button>
              <p className="text-xs text-ink-muted">
                {limit} of {sorted.length} shown
              </p>
            </div>
          )}
        </>
      )}

      {open && <ProductDrawer product={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  )
}

export function CategoryChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-10 flex-none items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
        active ? 'border-rose bg-rose text-white' : 'border-line bg-white text-plum hover:bg-blush-100',
        count === 0 && !active && 'opacity-50',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular text-xs', active ? 'text-white/80' : 'text-ink-muted')}>{count}</span>}
    </button>
  )
}

/** Compact product cards: one column on a phone, two or three on a laptop so long lists need less scrolling. */
function ProductGrid({ products, onOpen, showKind = false }: { products: StockItem[]; onOpen: (p: StockItem) => void; showKind?: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="flex h-full min-h-16 w-full items-center gap-3 rounded-xl border border-line-soft bg-white px-4 py-3 text-left shadow-card transition hover:border-rose/50 hover:bg-blush-50"
          >
            <Swatch name={p.colour?.name} />
            <span className="min-w-0 flex-1">
              {showKind && <span className="block truncate text-xs font-semibold text-ink-muted">{p.category?.name}</span>}
              <span className={cx('block truncate font-semibold', p.active ? 'text-plum' : 'text-ink-muted line-through')}>
                {[p.colour?.name, p.variant].filter(Boolean).join(' · ') || p.name}
              </span>
              <span className="block text-sm text-ink-muted">{p.price_cents === null ? 'No asking price' : `${formatKes(p.price_cents)} / ${p.unit}`}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className={cx('tabular font-semibold', p.tracks_stock && p.quantity === 0 ? 'text-danger' : 'text-plum')}>
                {p.tracks_stock ? quantityLabel(p.quantity, p.unit) : 'Service'}
              </span>
              {p.tracks_stock && p.quantity === 0 ? <Pill tone="warn">Out</Pill> : p.is_low && <Pill tone="warn">Low</Pill>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blush-200 py-0.5 pr-1 pl-3 text-xs font-semibold text-plum">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`} className="grid size-6 place-items-center rounded-full hover:bg-blush-300">
        <XMarkIcon className="size-3.5" />
      </button>
    </span>
  )
}
