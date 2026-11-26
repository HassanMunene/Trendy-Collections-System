import { Fragment, useId, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { InboxIcon, SearchIcon, XMarkIcon } from './icons'
import { Pagination } from './Pagination'

type RowKey = string | number

const interactiveSelector = "button, a, input, select, textarea, [role='button'], [data-table-stop-row-click]"
const searchInput =
  'min-h-11 w-full rounded-lg border border-line bg-white py-2 pl-10 pr-9 text-base text-ink placeholder:text-ink-faint shadow-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/25'

export interface DataTableColumn<T> {
  key?: string | number
  header: ReactNode
  render?: (row: T, index: number) => ReactNode
  align?: 'left' | 'right' | 'center'
  noWrap?: boolean
  headerClassName?: string
  cellClassName?: string
  /**
   * How this column appears in the phone/tablet card view (below 768px).
   * The first visible column is the card title by default; `actions` moves to the card footer.
   */
  mobile?: 'title' | 'detail' | 'actions' | 'hidden'
}

export interface DataTableProps<T> {
  columns?: DataTableColumn<T>[]
  data?: T[]
  isLoading?: boolean
  emptyContent?: ReactNode
  currentPage?: number
  itemsPerPage?: number
  totalItems?: number
  onPageChange?: (page: number) => void
  onItemsPerPageChange?: (itemsPerPage: number) => void
  onRowClick?: (row: T) => void
  rowKey?: keyof T | ((row: T, index: number) => RowKey)
  description?: ReactNode
  toolbar?: ReactNode
  activeFilters?: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  rowClassName?: string | ((row: T, index: number) => string)
  className?: string
}

/**
 * Shared table surface: a table on laptops, cards on phones. Callers own filtering and pagination state.
 * `toolbar` and `activeFilters` accept controls; `emptyContent` replaces the default empty state.
 */
export function DataTable<T>({
  columns = [],
  data = [],
  isLoading = false,
  emptyContent,
  currentPage = 1,
  itemsPerPage = 10,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  onRowClick,
  rowKey = 'id' as keyof T,
  description,
  toolbar,
  activeFilters,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records',
  rowClassName,
  className = '',
}: DataTableProps<T>) {
  const searchId = useId()
  const safeData = Array.isArray(data) ? data : []
  const itemCount = Math.max(0, Number(totalItems ?? safeData.length) || 0)
  const pageSize = Math.max(1, Number(itemsPerPage) || 1)

  const getKey = (row: T, index: number): RowKey => {
    if (typeof rowKey === 'function') return rowKey(row, index)
    const value = (row as Record<string, unknown> | null)?.[rowKey as string]
    return typeof value === 'string' || typeof value === 'number' ? value : index
  }

  const hasHeader = Boolean(description || toolbar || onSearchChange)
  const hasFooter = itemCount > pageSize || (itemCount > 0 && Boolean(onItemsPerPageChange))
  const columnCount = Math.max(1, columns.length)

  const handleRowClick = (event: MouseEvent<HTMLElement>, row: T) => {
    if (!onRowClick || (event.target as HTMLElement | null)?.closest?.(interactiveSelector)) return
    onRowClick(row)
  }
  const handleRowKeyDown = (event: KeyboardEvent<HTMLElement>, row: T) => {
    if (!onRowClick || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    onRowClick(row)
  }

  const cellValue = (col: DataTableColumn<T>, row: T, index: number) => (col.render ? col.render(row, index) : null)

  const isActions = (col: DataTableColumn<T>) => col.mobile === 'actions' || col.key === 'actions'
  const mobileTitle =
    columns.find((col) => col.mobile === 'title') ?? columns.find((col) => !isActions(col) && col.mobile !== 'hidden')
  const mobileDetails = columns.filter(
    (col) => col !== mobileTitle && !isActions(col) && col.mobile !== 'hidden',
  )
  const mobileActions = columns.filter(isActions)

  const emptyState = emptyContent || (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
        <InboxIcon className="size-6" />
      </span>
      <span className="text-sm font-semibold text-plum">Nothing found</span>
    </div>
  )

  const loading = (
    <span role="status" className="inline-flex items-center gap-3 text-sm text-ink-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      Loading records…
    </span>
  )

  return (
    <section className={cx('overflow-hidden rounded-2xl border border-line-soft bg-white shadow-card', className)} aria-label="Data table">
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft px-4 py-3.5 sm:px-5">
          {description && <div className="min-w-0 text-xs text-ink-muted">{description}</div>}
          {(onSearchChange || toolbar) && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {onSearchChange && (
                <div className="relative min-w-45 flex-1 sm:w-65 sm:flex-none lg:w-85">
                  <label htmlFor={searchId} className="sr-only">
                    {searchPlaceholder}
                  </label>
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                    <SearchIcon />
                  </span>
                  <input
                    id={searchId}
                    type="text"
                    value={searchValue ?? ''}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={searchPlaceholder}
                    className={searchInput}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-blush-200"
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  )}
                </div>
              )}
              {toolbar}
            </div>
          )}
        </div>
      )}

      {activeFilters && <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 sm:px-5">{activeFilters}</div>}

      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-blush-100/70 text-[11px] uppercase tracking-wider text-ink-muted">
              <tr>
                {columns.map((col, index) => (
                  <th
                    key={col.key ?? index}
                    scope="col"
                    className={cx(
                      'whitespace-nowrap border-b border-line-soft px-4 py-3 font-semibold',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.headerClassName,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {isLoading ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-16 text-center">
                    {loading}
                  </td>
                </tr>
              ) : safeData.length > 0 ? (
                safeData.map((row, rowIndex) => (
                  <tr
                    key={getKey(row, rowIndex)}
                    onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                    onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cx(
                      'transition-colors hover:bg-blush-50',
                      onRowClick && 'cursor-pointer',
                      typeof rowClassName === 'function' ? rowClassName(row, rowIndex) : rowClassName,
                    )}
                  >
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key ?? colIndex}
                        className={cx(
                          'px-4 py-4 align-middle text-ink',
                          col.noWrap && 'whitespace-nowrap',
                          col.align === 'right' ? 'text-right tabular' : col.align === 'center' ? 'text-center' : '',
                          col.cellClassName,
                        )}
                      >
                        {cellValue(col, row, rowIndex)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columnCount} className="px-5 py-16">
                    {emptyState}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden">
        {isLoading ? (
          <div className="px-4 py-14 text-center">{loading}</div>
        ) : safeData.length > 0 ? (
          <ul className="divide-y divide-line-soft">
            {safeData.map((row, rowIndex) => (
              <li
                key={getKey(row, rowIndex)}
                onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx(
                  'px-4 py-4 transition-colors hover:bg-blush-50',
                  onRowClick && 'cursor-pointer focus:bg-blush-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose/40',
                  typeof rowClassName === 'function' ? rowClassName(row, rowIndex) : rowClassName,
                )}
              >
                <div className="min-w-0">{mobileTitle ? cellValue(mobileTitle, row, rowIndex) : null}</div>

                {mobileDetails.length > 0 && (
                  <dl className="mt-3 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                    {mobileDetails.map((col, colIndex) => (
                      <Fragment key={col.key ?? colIndex}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide leading-5 text-ink-muted">{col.header}</dt>
                        <dd className={cx('min-w-0 text-ink', col.align === 'right' && 'tabular')}>{cellValue(col, row, rowIndex)}</dd>
                      </Fragment>
                    ))}
                  </dl>
                )}

                {mobileActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                    {mobileActions.map((col, colIndex) => (
                      <div key={col.key ?? colIndex}>{cellValue(col, row, rowIndex)}</div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-12">{emptyState}</div>
        )}
      </div>

      {hasFooter && (
        <div className="border-t border-line-soft bg-blush-50 px-4 py-3 sm:px-5">
          <Pagination
            totalItems={itemCount}
            itemsPerPage={pageSize}
            currentPage={currentPage}
            onPageChange={onPageChange}
            onItemsPerPageChange={onItemsPerPageChange}
          />
        </div>
      )}
    </section>
  )
}
