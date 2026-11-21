import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { StockItem } from '../api/types'
import { shillingsToCents } from '../lib/units'
import { useLookups } from '../lib/useLookups'
import { Drawer } from './Drawer'
import { Button, ErrorNotice, Field, Input, Select, Textarea, UnitInput } from './ui'
import { CameraUI } from '../components/CameraCapture'

const UNITS: { value: string; label: string }[] = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'm', label: 'Metres' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'pack', label: 'Packs' },
  { value: 'box', label: 'Boxes' },
  { value: 'set', label: 'Sets' },
  { value: 'roll', label: 'Rolls' },
]

interface ItemDraft {
  name: string
  sku: string
  unit: string
  quantity: string
  reorder_level: string
  cost: string
  supplier_id: string
  location: string
  notes: string
}

const emptyItem = (): ItemDraft => ({
  name: '',
  sku: '',
  unit: 'pcs',
  quantity: '',
  reorder_level: '',
  cost: '',
  supplier_id: '',
  location: '',
  notes: '',
})

/** Receive stock that is not a fabric roll: hangers, trims, lining, buttons. */
export function StockItemDrawer({ onClose }: { onClose: () => void }) {
  const lookups = useLookups()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<ItemDraft>(emptyItem)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState<StockItem | null>(null)

  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const f = problem?.fields ?? {}

  const quantity = Number(draft.quantity)
  const costCents = draft.cost.trim() ? shillingsToCents(draft.cost) : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)

    const errors: Record<string, string> = {}
    if (!draft.name.trim()) errors.name = 'What did you receive? e.g. Wooden hangers'
    if (!Number.isInteger(quantity) || quantity <= 0) errors.quantity = 'Enter how many, as a whole number, e.g. 200'
    if (costCents === null) errors.cost_cents = 'Enter what was paid in shillings (0 if unknown).'
    if (draft.reorder_level.trim() && (!Number.isInteger(Number(draft.reorder_level)) || Number(draft.reorder_level) < 0))
      errors.reorder_level = 'Enter a whole number, e.g. 50'
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }

    setBusy(true)
    try {
      const created = await api.receiveStockItem({
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        unit: draft.unit,
        quantity,
        reorder_level: draft.reorder_level.trim() ? Number(draft.reorder_level) : null,
        cost_cents: costCents,
        supplier_id: draft.supplier_id ? Number(draft.supplier_id) : null,
        location: draft.location.trim() || null,
        notes: draft.notes.trim() || null,
      })
      setReceived(created)
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  const unitLabel = UNITS.find((u) => u.value === draft.unit)?.label.toLowerCase() ?? draft.unit

  return (
    <Drawer
      onClose={onClose}
      title={received ? 'Stock received' : 'Receive stock'}
      description={received ? undefined : 'Hangers, trims, lining, buttons — anything counted in pieces, metres or kilos rather than fabric rolls.'}
      footer={
        received ? (
          <>
            <Button variant="secondary" onClick={() => { setReceived(null); setProblem(null); setDraft(emptyItem()) }}>
              Receive more
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <Button type="submit" form="stock-item-form" busy={busy}>
            Save stock
          </Button>
        )
      }
    >
      {received ? (
        <div className="rounded-2xl border border-line-soft bg-blush-50 p-4">
          <p className="text-sm font-semibold text-ink-muted">Added to stock</p>
          <p className="mt-1 font-display text-2xl text-plum">{received.name}</p>
          <p className="tabular mt-2 text-lg font-semibold">
            {received.quantity} {received.unit}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {received.location}
            {received.sku ? ` · ${received.sku}` : ''}
          </p>
        </div>
      ) : (
        <form id="stock-item-form" onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="What did you receive?" error={f.name} hint="e.g. Wooden hangers">
            {(a) => <Input {...a} value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
          </Field>

          <CameraUI onPhotoTaken={() => setDraft((d) => ({ ...d, name: `Captured item – photo attached` }))} onClose={() => {}} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How many?" error={f.quantity} hint={`In ${unitLabel}`}>
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={draft.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  placeholder="e.g. 200"
                />
              )}
            </Field>
            <Field label="Unit" error={f.unit} hint="How you count it">
              {(a) => (
                <Select {...a} value={draft.unit} onChange={(e) => set('unit', e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="SKU / shop code" error={f.sku} hint="Optional, e.g. HNG-01">
              {(a) => <Input {...a} value={draft.sku} onChange={(e) => set('sku', e.target.value)} autoCapitalize="characters" />}
            </Field>
            <Field label="Warn me when stock drops to" error={f.reorder_level} hint="Optional, in the same unit">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.reorder_level}
                  onChange={(e) => set('reorder_level', e.target.value)}
                  placeholder="e.g. 50"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total paid" error={f.cost_cents} hint="Only the owner and manager can see this.">
              {(a) => <UnitInput {...a} unit="KES" unitFirst value={draft.cost} onChange={(e) => set('cost', e.target.value)} placeholder="e.g. 12,000" />}
            </Field>
            <Field label="Where is it kept?" error={f.location} hint="Optional, e.g. Store">
              {(a) => (
                <>
                  <Input {...a} value={draft.location} onChange={(e) => set('location', e.target.value)} list="stock-item-locations" placeholder="Main shop" />
                  <datalist id="stock-item-locations">
                    {lookups.data?.locations.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Supplier" error={f.supplier_id} hint="Optional">
              {(a) => (
                <Select {...a} value={draft.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
                  <option value="">Not recorded</option>
                  {lookups.data?.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {[s.name, s.building, s.stall].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Notes" error={f.notes} hint="Optional">
            {(a) => <Textarea {...a} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>

          {problem && <ErrorNotice problem={problem} />}
        </form>
      )}
    </Drawer>
  )
}