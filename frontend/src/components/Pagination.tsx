import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const iconButton =
  'grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-muted transition hover:border-plum-300 hover:bg-blush-100 disabled:cursor-not-allowed disabled:opacity-40'

export interface PaginationProps {
  totalItems: number
  itemsPerPage: number
  currentPage: number
  onPageChange?: (page: number) => void
  onItemsPerPageChange?: (itemsPerPage: number) => void
}

export function Pagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  const pageSize = Math.max(1, Number(itemsPerPage) || 1)
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems === 0) return null

  const page = Math.min(Math.max(1, Number(currentPage) || 1), totalPages)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)
  const pageOptions = [...new Set([...PAGE_SIZE_OPTIONS, pageSize])].sort((a, b) => a - b)

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
