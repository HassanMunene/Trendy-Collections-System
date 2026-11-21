import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
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
  accessor?: (row: T, index: number) => ReactNode
  render?: (row: T, index: number) => ReactNode
  align?: 'left' | 'right' | 'center'
  noWrap?: boolean
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableSelection<T> {
  selectedKeys: Iterable<RowKey>
  onChange: (keys: RowKey[]) => void
  getLabel?: (row: T) => string
  actions?: ReactNode | ((keys: RowKey[]) => ReactNode)
}

export interface DataTableProps<T> {
  columns?: DataTableColumn<T>[]
  data?: T[]
  isLoading?: boolean
  emptyMessage?: string
  emptyContent?: ReactNode
  currentPage?: number
  itemsPerPage?: number
  totalItems?: number
  onPageChange?: (page: number) => void
  onItemsPerPageChange?: (itemsPerPage: number) => void
  itemsPerPageOptions?: number[]
  onRowClick?: (row: T) => void
  rowKey?: keyof T | ((row: T, index: number) => RowKey)
  footer?: ReactNode
  title?: string
  description?: ReactNode
  toolbar?: ReactNode
  activeFilters?: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  selection?: DataTableSelection<T>
  rowClassName?: string | ((row: T, index: number) => string)
  tableClassName?: string
  className?: string
  showFooter?: boolean
}

function SelectPageCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate: boolean; onChange: () => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 cursor-pointer rounded border-line accent-rose"
    />
  )
}

/**
 * Shared table surface. Callers own filtering, pagination and selection state.
 * `toolbar` and `activeFilters` accept controls; `searchValue` is optional controlled UI.
 * `selection` selects the visible page; `emptyContent` replaces the default empty state.
 */
export function DataTable<T>({
  columns = [],
  data = [],
  isLoading = false,
  emptyMessage = 'No data found',
  emptyContent,
  currentPage = 1,
  itemsPerPage = 10,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions,
  onRowClick,
  rowKey = 'id' as keyof T,
  footer,
  title,
  description,
  toolbar,
  activeFilters,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records',
  selection,
  rowClassName,
  tableClassName = '',
  className = '',
  showFooter,
}: DataTableProps<T>) {
  const titleId = useId()
  const safeData = Array.isArray(data) ? data : []
  const itemCount = Math.max(0, Number(totalItems ?? safeData.length) || 0)
  const pageSize = Math.max(1, Number(itemsPerPage) || 1)

  const getKey = (row: T, index: number): RowKey => {
    if (typeof rowKey === 'function') return rowKey(row, index)
    const value = (row as Record<string, unknown> | null)?.[rowKey as string]
    return typeof value === 'string' || typeof value === 'number' ? value : index
  }

  const canSelect = Boolean(selection?.onChange)
  const selectedKeys = new Set<RowKey>(selection?.selectedKeys ?? [])
  const pageKeys = safeData.map(getKey)
  const selectedOnPage = pageKeys.filter((key) => selectedKeys.has(key)).length
  const allPageSelected = pageKeys.length > 0 && selectedOnPage === pageKeys.length
  const hasHeader = Boolean(title || description || toolbar || onSearchChange)
  const hasFooter = showFooter ?? (Boolean(footer) || itemCount > pageSize || (itemCount > 0 && Boolean(onItemsPerPageChange)))
  const columnCount = Math.max(1, columns.length + Number(canSelect))

  const changeSelection = (keys: RowKey[]) => selection?.onChange(keys)
  const toggleRow = (key: RowKey) => {
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    changeSelection([...next])
  }
  const togglePage = () => {
    const next = new Set(selectedKeys)
    pageKeys.forEach((key) => (allPageSelected ? next.delete(key) : next.add(key)))
    changeSelection([...next])
  }
  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || (event.target as HTMLElement | null)?.closest?.(interactiveSelector)) return
    onRowClick(row)
  }
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    onRowClick(row)
  }

  return (
    <section
      className={cx('overflow-hidden rounded-2xl border border-line-soft bg-white shadow-card', className)}
      aria-label={title ? undefined : 'Data table'}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft px-4 py-3.5 sm:px-5">
          {(title || description) && (
            <div className="min-w-0">
              {title && <h2 id={titleId} className="m-0 font-display text-xl text-plum">{title}</h2>}
              {description && <div className="mt-0.5 text-xs text-ink-muted">{description}</div>}
            </div>
          )}
          {(onSearchChange || toolbar) && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {onSearchChange && (
                <div className="relative min-w-45 flex-1 sm:w-65 sm:flex-none lg:w-85">
                  <label htmlFor={`${titleId}-search`} className="sr-only">
                    {searchPlaceholder}
                  </label>
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                    <SearchIcon />
                  </span>
                  <input
                    id={`${titleId}-search`}
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

      {canSelect && selectedKeys.size > 0 && selection && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-blush-100 px-4 py-3 text-sm sm:px-5">
          <span className="rounded-full bg-white px-3 py-1.5 font-bold text-plum">{selectedKeys.size.toLocaleString()} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {typeof selection.actions === 'function' ? selection.actions([...selectedKeys]) : selection.actions}
            <button type="button" onClick={() => changeSelection([])} className="rounded-lg px-3 py-1.5 font-medium text-ink-muted hover:bg-blush-200">
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={cx('w-full border-collapse text-left text-sm', tableClassName)} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : 'Data table'}>
          <thead className="bg-blush-100/70 text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              {canSelect && (
                <th scope="col" className="w-12 border-b border-line-soft px-4 py-3">
                  <SelectPageCheckbox
                    checked={allPageSelected}
                    indeterminate={selectedOnPage > 0 && !allPageSelected}
                    onChange={togglePage}
                    label="Select all rows on this page"
                  />
                </th>
              )}
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
                  <span role="status" className="inline-flex items-center gap-3 text-sm text-ink-muted">
                    <span className="size-5 animate-spin rounded-full border-2 border-rose border-t-transparent" />
                    Loading records…
                  </span>
                </td>
              </tr>
            ) : safeData.length > 0 ? (
              safeData.map((row, rowIndex) => {
                const key = getKey(row, rowIndex)
                const selected = canSelect && selectedKeys.has(key)
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                    onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cx(
                      'transition-colors',
                      selected ? 'bg-blush-100 hover:bg-blush-200' : 'hover:bg-blush-50',
                      onRowClick && 'cursor-pointer',
                      typeof rowClassName === 'function' ? rowClassName(row, rowIndex) : rowClassName,
                    )}
                  >
                    {canSelect && (
                      <td className="w-12 px-4 py-4" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRow(key)}
                          aria-label={selection?.getLabel?.(row) || `Select row ${key}`}
                          className="size-4 cursor-pointer rounded border-line accent-rose"
                        />
                      </td>
                    )}
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
                        {col.render ? col.render(row, rowIndex) : col.accessor ? col.accessor(row, rowIndex) : null}
                      </td>
                    ))}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-5 py-16">
                  {emptyContent || (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                        <InboxIcon className="size-6" />
                      </span>
                      <span className="text-sm font-semibold text-plum">{emptyMessage}</span>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasFooter && (
        <div className="border-t border-line-soft bg-blush-50 px-4 py-3 sm:px-5">
          {footer || (
            <Pagination
              variant="table"
              totalItems={itemCount}
              itemsPerPage={pageSize}
              currentPage={currentPage}
              onPageChange={onPageChange}
              onItemsPerPageChange={onItemsPerPageChange}
              itemsPerPageOptions={itemsPerPageOptions}
            />
          )}
        </div>
      )}
    </section>
  )
}

export default DataTable
