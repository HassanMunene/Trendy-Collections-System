import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Customer, MoneyMethod } from '../api/types'
import { CUSTOMERS_KEY } from '../lib/useCatalogue'
import { formatKes, shillingsToCents } from '../lib/units'
import { Drawer } from './Drawer'
import { MethodPicker } from './MethodPicker'
import { useToast } from './toast-context'
import { Button, ErrorNotice, Field, Input, UnitInput } from './ui'

/** A customer paying off what they took on "to pay". */
export function AccountPaymentDrawer({ customer, onClose, onPaid }: { customer: Customer; onClose: () => void; onPaid?: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [amount, setAmount] = useState(String(customer.owed_cents / 100))
  const [method, setMethod] = useState<MoneyMethod>('cash')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = shillingsToCents(amount)
    if (cents === null || cents <= 0) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { amount_cents: 'Enter the amount paid, e.g. 2,000' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const paid = await api.payAccount(customer.id, { method, amount_cents: cents, mpesa_code: code.trim() || null, note: note.trim() })
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      qc.invalidateQueries({ queryKey: ['day-book'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(
        paid.owed_after_cents ? `${formatKes(cents)} received. ${customer.name} still owes ${formatKes(paid.owed_after_cents)}.` : `${formatKes(cents)} received. ${customer.name} is fully paid up.`,
      )
      onPaid?.()
      onClose()
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title="Record a payment"
      description={`${customer.name} owes ${formatKes(customer.owed_cents)}`}
      footer={
        <Button type="submit" form="account-payment-form" busy={busy}>
          Save payment
        </Button>
      }
    >
      <form id="account-payment-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Amount paid" error={f.amount_cents} hint="Part payments are fine.">
          {(a) => <UnitInput {...a} unit="KES" unitFirst value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />}
        </Field>
        <MethodPicker methods={['cash', 'send_money', 'paybill']} value={method} onChange={setMethod} code={code} onCode={setCode} codeError={f.mpesa_code} />
        <Field label="Note" hint="Optional">
          {(a) => <Input {...a} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {problem && !f.amount_cents && !f.mpesa_code && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
