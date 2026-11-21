import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Supplier } from '../api/types'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { TruckIcon } from '../components/icons'
import { useToast } from '../components/toast-context'
import { Button, ErrorNotice, Field, Input, PageHeader, Pill, Textarea } from '../components/ui'
import { cx } from '../lib/cx'
import { formatPhone } from '../lib/units'

const PAGE_SIZE = 10

const place = (s: Supplier) => [s.building, s.stall].filter(Boolean).join(' · ')

export function SuppliersPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)

  const suppliers = data ?? []
  const term = q.trim().toLowerCase()
  const shown = suppliers.filter(
    (s) => !term || `${s.name} ${s.phone ?? ''} ${s.building} ${s.stall} ${s.notes}`.toLowerCase().includes(term),
  )
  const pageCount = Math.max(1, Math.ceil(shown.length / itemsPerPage))
  const safePage = Math.min(page, pageCount)
  const pageRows = shown.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

  const columns: DataTableColumn<Supplier>[] = [
    {
      key: 'supplier',
      header: 'Supplier',
      render: (s) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{s.name}</p>
          <p className="text-xs text-ink-muted">{place(s) || 'No building or stall recorded'}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      noWrap: true,
      render: (s) =>
        s.phone ? (
          <a href={`tel:+${s.phone}`} className="text-plum-700 underline decoration-line decoration-1 underline-offset-2 hover:text-rose">
            {formatPhone(s.phone)}
          </a>
        ) : (
          <Pill tone="warn">No phone</Pill>
        ),
    },
    {
      key: 'notes',
      header: 'Notes',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      render: (s) => <span className="line-clamp-1 max-w-70 text-ink-muted">{s.notes || '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      noWrap: true,
      render: (s) => (
        <div data-table-stop-row-click>
          <Button
            variant="secondary"
            className="min-h-9 px-3 text-xs sm:text-sm"
            onClick={() => setEditing(s)}
            aria-label={`Edit ${s.name}`}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="The shops and people you buy fabric from. A name and phone number are enough; everything else is optional."
        action={<Button onClick={() => setEditing('new')}>+ Add supplier</Button>}
      />

      {error ? (
        <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
      ) : (
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
          onRowClick={(s) => setEditing(s)}
          searchValue={q}
          onSearchChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          searchPlaceholder="Search name, phone, building or stall…"
          description={`${suppliers.length} ${suppliers.length === 1 ? 'supplier' : 'suppliers'}`}
          emptyContent={
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                <TruckIcon />
              </span>
              <p className="font-display text-xl text-plum">{suppliers.length ? 'No supplier matches' : 'No suppliers yet'}</p>
              <p className="max-w-md text-sm text-ink-muted">
                {suppliers.length
                  ? 'Try another search, or add this supplier now.'
                  : 'Add the shops you buy from so every roll can be traced back to where it came from.'}
              </p>
              <Button className="mt-2" onClick={() => setEditing('new')}>
                + Add supplier
              </Button>
            </div>
          }
        />
      )}

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? 'Add supplier' : 'Edit supplier'}
          description={
            editing === 'new'
              ? 'Save the name and phone now; you can fill in the rest later.'
              : `Updating the details for ${editing.name}.`
          }
          size="md"
          onClose={() => setEditing(null)}
        >
          <SupplierForm
            key={editing === 'new' ? 'new' : editing.id}
            existing={editing === 'new' ? null : editing}
            onSaved={(message) => {
              setEditing(null)
              toast.success(message)
              qc.invalidateQueries({ queryKey: ['suppliers'] })
              qc.invalidateQueries({ queryKey: ['lookups'] })
            }}
            onCancel={() => setEditing(null)}
          />
        </Drawer>
      )}
    </>
  )
}

function SupplierForm({ existing, onSaved, onCancel }: { existing: Supplier | null; onSaved: (message: ReactNode) => void; onCancel: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(existing?.name ?? '')
  const [phone, setPhone] = useState(formatPhone(existing?.phone))
  const [building, setBuilding] = useState(existing?.building ?? '')
  const [stall, setStall] = useState(existing?.stall ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    const body = { name, phone, building, stall, notes }
    try {
      if (existing) {
        await api.updateSupplier(existing.id, body)
        onSaved(
          <>
            <strong>{name}</strong> was updated.
          </>,
        )
      } else {
        await api.createSupplier(body)
        onSaved(
          <>
            <strong>{name}</strong> was added to your suppliers.
          </>,
        )
      }
    } catch (err) {
      const p = toProblem(err)
      setProblem(p)
      if (Object.keys(p.fields).length === 0) toast.error(p.message)
    } finally {
      setBusy(false)
    }
  }

  const f = problem?.fields ?? {}
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Supplier or shop name" error={f.name} className="sm:col-span-2">
        {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />}
      </Field>
      <Field label="Phone number" error={f.phone} hint="Required, so you can reach them about an order." className="sm:col-span-2">
        {(a) => <Input {...a} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />}
      </Field>
      <Field label="Building or plaza" error={f.building} hint="Optional">
        {(a) => <Input {...a} value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="e.g. Garissa Lodge" />}
      </Field>
      <Field label="Stall or shop number" error={f.stall} hint="Optional">
        {(a) => <Input {...a} value={stall} onChange={(e) => setStall(e.target.value)} placeholder="e.g. B12" />}
      </Field>
      <Field label="Notes" error={f.notes} hint="Optional: delivery days, who to ask for, quality to watch." className="sm:col-span-2">
        {(a) => <Textarea {...a} rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      {problem && Object.keys(problem.fields).length === 0 && (
        <div className="sm:col-span-2">
          <ErrorNotice problem={problem} />
        </div>
      )}
      <div className={cx('flex flex-wrap gap-2 border-t border-line-soft pt-4 sm:col-span-2')}>
        <Button type="submit" busy={busy} disabled={!name.trim() || !phone.trim()}>
          {existing ? 'Save changes' : 'Add supplier'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
