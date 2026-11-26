import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Customer } from '../api/types'
import { CUSTOMERS_KEY } from '../lib/useCatalogue'
import { formatKes, formatPhone } from '../lib/units'
import { Drawer } from './Drawer'
import { Button, ErrorNotice, Field, Input, Loading, Pill, Textarea } from './ui'

/** Choose a regular or neighbouring shop, or add one in a few taps. */
export function CustomerPicker({ onPick, onClose }: { onPick: (c: Customer) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const customers = useQuery({ queryKey: [...CUSTOMERS_KEY, { q }], queryFn: () => api.customers({ q }) })

  if (adding) {
    return <CustomerForm initialName={search} onClose={() => setAdding(false)} onSaved={onPick} />
  }

  return (
    <Drawer
      onClose={onClose}
      title="Choose customer"
      description="Regulars and shops in the building. Walk-ins do not need one."
      footer={
        <Button variant="secondary" onClick={() => setAdding(true)}>
          + New customer
        </Button>
      }
    >
      <div className="grid gap-3">
        <Input type="search" autoFocus placeholder="Name, stall or phone…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        {customers.error && <ErrorNotice problem={toProblem(customers.error)} onRetry={() => customers.refetch()} />}
        {customers.isLoading && <Loading />}
        {customers.data?.length === 0 && (
          <div className="py-6 text-center text-sm text-ink-muted">
            <p>No customer matches.</p>
            <Button variant="ghost" className="mt-2" onClick={() => setAdding(true)}>
              Add {search.trim() ? `“${search.trim()}”` : 'a new customer'}
            </Button>
          </div>
        )}
        <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
          {customers.data?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-blush-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-plum">{c.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{[c.stall, formatPhone(c.phone)].filter(Boolean).join(' · ') || ' '}</span>
                </span>
                {c.owed_cents > 0 && <Pill tone="warn">Owes {formatKes(c.owed_cents)}</Pill>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  )
}

export function CustomerForm({
  customer,
  initialName = '',
  onClose,
  onSaved,
}: {
  customer?: Customer
  initialName?: string
  onClose: () => void
  onSaved: (c: Customer) => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name: customer?.name ?? initialName,
    stall: customer?.stall ?? '',
    phone: formatPhone(customer?.phone),
    notes: customer?.notes ?? '',
  })
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof draft>(k: K, v: string) => setDraft((d) => ({ ...d, [k]: v }))
  const f = problem?.fields ?? {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { name: 'Enter a name, e.g. Lily Collection' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const body = { name: draft.name.trim(), stall: draft.stall.trim(), phone: draft.phone.trim(), notes: draft.notes.trim() }
      const saved = customer ? await api.updateCustomer(customer.id, body) : await api.createCustomer(body)
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      onSaved(saved)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={customer ? 'Edit customer' : 'New customer'}
      footer={
        <Button type="submit" form="customer-form" busy={busy}>
          Save customer
        </Button>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Name" error={f.name} hint="A person or a shop, e.g. Lily Collection">
          {(a) => <Input {...a} autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="Stall / location" error={f.stall} hint="Optional, e.g. BS 60, 3rd floor">
          {(a) => <Input {...a} value={draft.stall} onChange={(e) => set('stall', e.target.value)} />}
        </Field>
        <Field label="Phone" error={f.phone} hint="Optional">
          {(a) => <Input {...a} type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" />}
        </Field>
        <Field label="Notes" error={f.notes} hint="Optional">
          {(a) => <Textarea {...a} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
        {problem && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
