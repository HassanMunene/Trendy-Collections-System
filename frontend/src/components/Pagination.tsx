import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { cx } from '../lib/cx'

function buildPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

const DEFAULT_PAGE_OPTIONS = [10, 25, 50, 100]

const iconButton =
  'grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-muted transition hover:border-plum-300 hover:bg-blush-100 disabled:cursor-not-allowed disabled:opacity-40'

export interface PaginationProps {
  totalItems: number
  itemsPerPage: number
  currentPage: number
  onPageChange?: (page: number) => void
  onItemsPerPageChange?: (itemsPerPage: number) => void
  itemsPerPageOptions?: number[]
  variant?: 'default' | 'table'
}

export function Pagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = DEFAULT_PAGE_OPTIONS,
  variant = 'default',
}: PaginationProps) {
  const pageSize = Math.max(1, Number(itemsPerPage) || 1)
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems === 0) return null

  const page = Math.min(Math.max(1, Number(currentPage) || 1), totalPages)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)
  const pageOptions = [...new Set([...itemsPerPageOptions, pageSize])].sort((a, b) => a - b)

  const rowsPerPage = onItemsPerPageChange && (
    <label className="flex items-center gap-2">
      Rows per page
      <select
        value={pageSize}
        onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
        className="min-h-8 rounded-lg border border-line bg-white px-2 py-1.5 text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/25"
      >
        {pageOptions.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  )

  if (variant === 'table') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
        <span aria-live="polite" className="tabular">
          Showing {from.toLocaleString()}–{to.toLocaleString()} of {totalItems.toLocaleString()}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {rowsPerPage}
          {onPageChange && (
            <nav aria-label="Table pages" className="flex items-center gap-1">
              <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page" className={iconButton}>
                <ChevronDoubleLeftIcon className="size-4" />
              </button>
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className={iconButton}>
                <ChevronLeftIcon className="size-4" />
              </button>
              <span className="min-w-22 px-1 text-center font-medium tabular text-plum-700">
                Page {page} of {totalPages}
              </span>
              <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page" className={iconButton}>
                <ChevronRightIcon className="size-4" />
              </button>
              <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} aria-label="Last page" className={iconButton}>
                <ChevronDoubleRightIcon className="size-4" />
              </button>
            </nav>
          )}
        </div>
      </div>
    )
  }

  const pages = buildPages(page, totalPages)
  const stepButton =
    'inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-ink-muted transition hover:bg-blush-200 disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-3">
        <span className="tabular text-[13px] text-ink-muted">
          {from}–{to} of {totalItems.toLocaleString()}
        </span>
        {rowsPerPage}
      </div>

      <nav className="flex items-center gap-0.5" aria-label="Pagination">
        <button type="button" onClick={() => onPageChange?.(page - 1)} disabled={page === 1 || !onPageChange} className={stepButton}>
          <ChevronLeftIcon className="size-3.5" />
          Prev
        </button>

        {pages.map((entry, index) => {
          if (entry === '...') {
            return (
              <span key={`dots-${index}`} className="flex size-8 items-center justify-center text-[13px] text-ink-muted">
                …
              </span>
            )
          }
          const isActive = entry === page
          return (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange?.(entry)}
              disabled={!onPageChange}
              aria-label={`Page ${entry}`}
              aria-current={isActive ? 'page' : undefined}
              className={cx(
                'size-8 rounded-lg text-[13px] font-medium transition-colors',
                isActive ? 'bg-rose text-white' : 'text-ink-muted hover:bg-blush-200',
              )}
            >
              {entry}
            </button>
          )
        })}

        <button type="button" onClick={() => onPageChange?.(page + 1)} disabled={page === totalPages || !onPageChange} className={stepButton}>
          Next
          <ChevronRightIcon className="size-3.5" />
        </button>
      </nav>
    </div>
  )
}

export default Pagination
