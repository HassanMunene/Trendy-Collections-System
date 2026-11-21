import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { AuditEvent } from '../api/types'
import { Avatar } from '../components/Avatar'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Modal } from '../components/Dialog'
import { AuditIcon } from '../components/icons'
import { Button, DetailList, ErrorNotice, Input, PageHeader, Pill, Select } from '../components/ui'
import { cx } from '../lib/cx'
import { formatDateTime, formatKes, formatMetres } from '../lib/units'

const PAGE_SIZE = 50

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Changed own password',
  'staff.created': 'Staff account created',
  'staff.updated': 'Staff details changed',
  'staff.password_reset': 'Staff password reset',
  'staff.activated': 'Staff account switched on',
  'staff.deactivated': 'Staff account switched off',
  'role.created': 'Custom role created',
  'role.updated': 'Role details changed',
  'role.deleted': 'Custom role deleted',
  'role.permissions_updated': 'Role permissions changed',
  'staff.owner_created': 'Owner account created',
  'staff.superadmin_created': 'Superadmin account created',
  'fabric.created': 'Fabric created',
  'fabric.updated': 'Fabric changed',
  'catalogue.term_created': 'Catalogue option added',
  'roll.received': 'Roll received',
  'roll.adjusted': 'Stock count corrected',
  'stock_item.received': 'Stock item received',
  'supplier.created': 'Supplier added',
  'supplier.updated': 'Supplier changed',
  'profile.updated': 'Own profile updated',
  'profile.avatar_updated': 'Profile photo updated',
  'profile.avatar_removed': 'Profile photo removed',
}

const GROUPS = [
  { value: '', label: 'Everything' },
  { value: 'stock', label: 'Stock & receiving' },
  { value: 'catalogue', label: 'Fabrics & catalogue' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'staff', label: 'Staff accounts' },
  { value: 'auth', label: 'Sign in & out' },
  { value: 'profile', label: 'Profiles' },
]

const ENTITY_LABELS: Record<string, string> = {
  rolls: 'Roll',
  fabrics: 'Fabric',
  fabric_categories: 'Fabric category',
  material_types: 'Material type',
  textures: 'Texture',
  colours: 'Colour',
  suppliers: 'Supplier',
  stock_items: 'Stock item',
  users: 'Staff account',
}

const human = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const actionLabel = (action: string) => ACTION_LABELS[action] ?? human(action.replace('.', ' '))

const entityLabel = (event: AuditEvent) => {
  const name = ENTITY_LABELS[event.entity_type] ?? human(event.entity_type)
  return event.entity_id ? `${name} #${event.entity_id}` : name
}

const firstText = (details: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = details[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number') return String(value)
  }
  return null
}

function summary(event: AuditEvent): string {
  const d = event.details
  switch (event.action) {
    case 'roll.adjusted':
      return `${formatMetres(Number(d.before_cm))} → ${formatMetres(Number(d.after_cm))}`
    case 'roll.received':
      return [d.tag ? `Roll ${d.tag}` : null, d.received_cm != null ? formatMetres(Number(d.received_cm)) : null].filter(Boolean).join(' · ')
    case 'fabric.created':
      return d.code ? `Fabric ${d.code}` : ''
    case 'supplier.created':
    case 'supplier.updated':
    case 'catalogue.term_created':
      return firstText(d, ['name']) ?? ''
    case 'stock_item.received':
      return [firstText(d, ['name']), firstText(d, ['unit'])].filter(Boolean).join(' · ')
    case 'staff.created':
      return [firstText(d, ['username']) ? `@${firstText(d, ['username'])}` : null, firstText(d, ['role'])].filter(Boolean).join(' · ')
    case 'role.permissions_updated': {
      const after = (d.after as unknown[] | undefined) ?? []
      return `${firstText(d, ['role']) ?? 'Role'} · ${after.length} ${after.length === 1 ? 'permission' : 'permissions'}`
    }
    case 'staff.password_reset':
      return 'New password set; signed out everywhere'
    case 'fabric.updated':
    case 'staff.updated':
    case 'profile.updated': {
      const changed = Object.keys((d.after as Record<string, unknown> | undefined) ?? {})
      return changed.length ? `${changed.length} ${changed.length === 1 ? 'field' : 'fields'} changed` : 'Details changed'
    }
    default:
      return firstText(d, ['label', 'tag', 'code', 'name', 'username', 'role']) ?? ''
  }
}

function detailValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') {
    if (key.endsWith('_cm')) return formatMetres(value)
    if (key.endsWith('_cents') || key.endsWith('_cents_per_m')) return formatKes(value)
    return value.toLocaleString()
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (!entries.length) return '—'
    return (
      <span className="grid gap-1">
        {entries.map(([field, fieldValue]) => (
          <span key={field}>
            <span className="text-ink-muted">{human(field)}:</span> {detailValue(field, fieldValue)}
          </span>
        ))}
      </span>
    )
  }
  return String(value)
}

export function AuditPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEvent | null>(null)

  // Search as you type, but wait until typing pauses.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useQuery({
    queryKey: ['audit', { q, group, from, to, page }],
    queryFn: () => api.auditEvents({ q: q || undefined, group: group || undefined, from: from || undefined, to: to || undefined, page }),
    placeholderData: keepPreviousData,
  })

  const filtersActive = Boolean(q || group || from || to)
  const rows = query.data?.data ?? []

  const clearFilters = () => {
    setSearch('')
    setQ('')
    setGroup('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      key: 'when',
      header: 'When',
      noWrap: true,
      cellClassName: 'align-top text-ink-muted',
      render: (event) => formatDateTime(event.created_at),
    },
    {
      key: 'who',
      header: 'Who',
      render: (event) =>
        event.actor ? (
          <div className="flex items-center gap-2">
            <Avatar name={event.actor.name} url={event.actor.avatar_url} size="xs" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{event.actor.name}</p>
              <p className="text-xs text-ink-muted">@{event.actor.username}</p>
            </div>
          </div>
        ) : (
          <Pill tone="muted">System</Pill>
        ),
    },
    {
      key: 'action',
      header: 'What happened',
      mobile: 'title',
      render: (event) => (
        <div className="min-w-45">
          <p className="font-semibold text-ink">{actionLabel(event.action)}</p>
          <p className="line-clamp-1 text-xs text-ink-muted">{summary(event) || entityLabel(event)}</p>
        </div>
      ),
    },
    {
      key: 'record',
      header: 'Record',
      noWrap: true,
      headerClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden lg:table-cell text-ink-muted',
      render: (event) => entityLabel(event),
    },
    {
      key: 'ip',
      header: 'From',
      noWrap: true,
      mobile: 'hidden',
      headerClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden xl:table-cell text-ink-muted',
      render: (event) => event.ip_address ?? '—',
    },
  ]

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every change, sign-in and stock correction, newest first. Entries can never be edited or deleted."
      />

      {query.error ? (
        <ErrorNotice problem={toProblem(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={query.isLoading}
          rowKey="id"
          currentPage={query.data?.meta.current_page ?? page}
          itemsPerPage={query.data?.meta.per_page ?? PAGE_SIZE}
          totalItems={query.data?.meta.total ?? 0}
          onPageChange={setPage}
          onRowClick={setSelected}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search who, what, record or details…"
          description={query.data ? `${query.data.meta.total.toLocaleString()} ${query.data.meta.total === 1 ? 'entry' : 'entries'}` : ' '}
          toolbar={
            <Select
              aria-label="Filter by area"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value)
                setPage(1)
              }}
              className="min-h-11 py-1.5 text-sm"
            >
              {GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          }
          activeFilters={
            <>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                From
                <Input
                  type="date"
                  aria-label="From date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  className="min-h-9 w-38 py-1 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                To
                <Input
                  type="date"
                  aria-label="To date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  className="min-h-9 w-38 py-1 text-sm"
                />
              </label>
              {filtersActive && (
                <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </>
          }
          emptyContent={
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                <AuditIcon />
              </span>
              <p className="font-display text-xl text-plum">{filtersActive ? 'No entries match' : 'Nothing recorded yet'}</p>
              <p className="max-w-md text-sm text-ink-muted">
                {filtersActive ? 'Try a different search or widen the dates.' : 'Sign-ins, stock receipts, corrections and account changes will appear here.'}
              </p>
              {filtersActive && (
                <Button className="mt-2" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          }
        />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? actionLabel(selected.action) : 'Audit entry'}
        description={selected ? formatDateTime(selected.created_at) : undefined}
        size="lg"
      >
        {selected && (
          <div className="grid gap-6">
            <DetailList
              items={[
                ['Who', selected.actor ? `${selected.actor.name} (@${selected.actor.username})` : 'System'],
                ['Record', entityLabel(selected)],
                ['IP address', selected.ip_address ?? '—'],
                ['Entry', `#${selected.id}`],
              ]}
            />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-plum">What was recorded</h3>
              {Object.keys(selected.details).length ? (
                <div className="rounded-xl border border-line-soft bg-blush-50 px-4">
                  <DetailList
                    items={Object.entries(selected.details).map(([key, value]) => [
                      human(key),
                      <span key={key} className={cx(typeof value === 'object' && 'block text-left')}>
                        {detailValue(key, value)}
                      </span>,
                    ])}
                  />
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No extra details were stored for this entry.</p>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Audit entries are append-only. They cannot be edited or deleted, including by an owner.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
