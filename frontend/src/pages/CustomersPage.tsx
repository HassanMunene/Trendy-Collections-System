import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { AccountPayment, Customer } from '../api/types'
import { useCan } from '../auth/useMe'
import { AccountPaymentDrawer } from '../components/AccountPaymentDrawer'
import { useToast } from '../components/toast-context'
import { VoidDrawer } from '../components/VoidDrawer'
import { CustomerForm } from '../components/CustomerPicker'
import { Drawer } from '../components/Drawer'
import { PeopleIcon } from '../components/icons'
import { Button, DetailList, EmptyState, ErrorNotice, Input, Loading, PageHeader, Pill } from '../components/ui'
import { cx } from '../lib/cx'
import { CUSTOMERS_KEY } from '../lib/useCatalogue'
import { useLinkedId } from '../lib/useLinkedId'
import { formatDate, formatDateTime, formatKes, formatPhone } from '../lib/units'

/** Regulars and the neighbouring shops, with what they have taken on "to pay". */
export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const owing = params.get('owing') === '1'
  const setOwing = (on: boolean) =>
    setParams((current) => {
      const p = new URLSearchParams(current)
      if (on) p.set('owing', '1')
      else p.delete('owing')
      return p
    }, { replace: true })
  const [adding, setAdding] = useState(false)
  const [customerId, setCustomerId] = useLinkedId('customer')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const customers = useQuery({ queryKey: [...CUSTOMERS_KEY, { q, owing }], queryFn: () => api.customers({ q, owing }) })
  const totalOwed = (customers.data ?? []).reduce((s, c) => s + c.owed_cents, 0)
  // Same cache entry as the drawer's own detail query.
  const linked = useQuery({ queryKey: [...CUSTOMERS_KEY, customerId], queryFn: () => api.customerDetail(customerId!), enabled: customerId !== null })
  const linkedCustomer: Customer | undefined = linked.data?.data ?? customers.data?.find((c) => c.id === customerId)

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Regulars and shops in the building. Walk-ins do not need to be added."
        action={
          <Button onClick={() => setAdding(true)}>
            <PeopleIcon />
            New customer
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input type="search" placeholder="Name, stall or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" aria-label="Search customers" />
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="size-5 accent-rose" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
          Owing money only
        </label>
        {owing && totalOwed > 0 && <Pill tone="warn">Total owed {formatKes(totalOwed)}</Pill>}
      </div>

      {customers.error && <ErrorNotice problem={toProblem(customers.error)} onRetry={() => customers.refetch()} />}
      {customers.isLoading && <Loading />}
      {customers.data?.length === 0 && <EmptyState title={q || owing ? 'No customer matches' : 'No customers yet'}>Add regulars and neighbouring shops here, or straight from the Sell screen.</EmptyState>}

      <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-white shadow-card">
        {customers.data?.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setCustomerId(c.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-blush-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-plum">{c.name}</span>
                <span className="block truncate text-sm text-ink-muted">{[c.stall, formatPhone(c.phone)].filter(Boolean).join(' · ') || ' '}</span>
              </span>
              <span className="flex flex-col items-end gap-1 text-right">
                {c.owed_cents > 0 && <Pill tone="warn">Owes {formatKes(c.owed_cents)}</Pill>}
                <span className="text-xs text-ink-muted">{c.last_sale_at ? `Last bought ${formatDate(c.last_sale_at)}` : 'No sales yet'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
      {customerId !== null && linkedCustomer && <CustomerDrawer key={customerId} customer={linkedCustomer} onClose={() => setCustomerId(null)} />}
    </>
  )
}

function CustomerDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState<AccountPayment | null>(null)
  const canVoid = useCan('void_sales')
  const qc = useQueryClient()
  const toast = useToast()
  const detail = useQuery({ queryKey: [...CUSTOMERS_KEY, customer.id], queryFn: () => api.customerDetail(customer.id) })
  const c = detail.data?.data ?? customer

  if (editing) return <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
  if (paying) return <AccountPaymentDrawer customer={c} onClose={() => setPaying(false)} />
  if (voiding)
    return (
      <VoidDrawer
        title="Void this payment?"
        description={`${c.name} · ${formatKes(voiding.amount_cents)}`}
        explanation="The amount goes back onto what they owe. The payment stays on record, crossed out, with your name and reason."
        onClose={() => setVoiding(null)}
        onVoid={async (reason) => {
          await api.voidAccountPayment(voiding.id, reason)
          qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
          qc.invalidateQueries({ queryKey: ['day-book'] })
          toast.success('Payment voided.')
          setVoiding(null)
        }}
      />
    )

  return (
    <Drawer
      onClose={onClose}
      title={c.name}
      description={c.stall || undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {c.owed_cents > 0 && <Button onClick={() => setPaying(true)}>Record payment</Button>}
        </>
      }
    >
      <div className="grid gap-5">
        {c.owed_cents > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Taken on “to pay”</p>
            <p className="tabular font-display text-3xl text-plum">{formatKes(c.owed_cents)}</p>
          </div>
        )}
        <DetailList
          items={[
            ['Phone', formatPhone(c.phone)],
            ['Stall / location', c.stall],
            ['Notes', c.notes],
          ]}
        />
        {c.owed_cents < 0 && (
          <div className="rounded-2xl border border-success/40 bg-success-soft p-4">
            <p className="text-sm font-semibold text-success">In credit</p>
            <p className="tabular font-display text-2xl text-plum">{formatKes(-c.owed_cents)}</p>
            <p className="mt-1 text-xs text-ink-muted">From returns credited to their account; it comes off their next “to pay”.</p>
          </div>
        )}
        {(detail.data?.account_payments.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-2 font-display text-lg text-plum">Payments towards their account</h3>
            <ul className="divide-y divide-line-soft">
              {detail.data?.account_payments.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!canVoid || p.voided}
                    onClick={() => setVoiding(p)}
                    className={cx('flex w-full justify-between gap-2 py-2 text-left text-sm enabled:hover:bg-blush-50', p.voided && 'text-ink-muted line-through')}
                  >
                    <span>
                      <span className="font-semibold text-plum">{formatDateTime(p.created_at)}</span>
                      <span className="block text-xs text-ink-muted">
                        {p.method_label}
                        {p.mpesa_code && ` · ${p.mpesa_code}`} · {p.received_by?.name}
                        {p.voided && ` · voided: ${p.void_reason}`}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{formatKes(p.amount_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(detail.data?.orders.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-2 font-display text-lg text-plum">Custom orders</h3>
            <ul className="divide-y divide-line-soft">
              {detail.data?.orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-plum">
                      {o.number} · {o.status_label}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{o.lines?.map((l) => l.description).join(', ')}</span>
                  </span>
                  <span className="tabular text-right">
                    {formatKes(o.total_cents)}
                    {o.balance_cents > 0 && <span className="block text-xs font-semibold text-amber-800">Balance {formatKes(o.balance_cents)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="mb-2 font-display text-lg text-plum">Recent sales</h3>
          {detail.isLoading && <Loading />}
          {detail.data?.sales.length === 0 && <p className="text-sm text-ink-muted">No sales yet.</p>}
          <ul className="divide-y divide-line-soft">
            {detail.data?.sales.map((s) => (
              <li key={s.id} className={cx('py-2 text-sm', s.status === 'voided' && 'text-ink-muted line-through')}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-plum">
                    {s.number} · {formatDateTime(s.created_at)}
                  </span>
                  <span className="tabular font-semibold">{formatKes(s.total_cents)}</span>
                </div>
                <p className="text-ink-muted">{s.lines?.map((l) => l.description).join(', ')}</p>
                <p className="text-xs text-ink-muted">{s.payments?.map((p) => p.method_label).join(' + ')}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  )
}
