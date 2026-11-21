import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Roll } from '../api/types'
import { cx } from '../lib/cx'
import { draftToFabricPayload, emptyFabricDraft, nestedErrors, type FabricDraft } from '../lib/fabricDraft'
import { formatKes, formatMetres, metresToCm, shillingsToCents } from '../lib/units'
import { useLookups } from '../lib/useLookups'
import { Drawer } from './Drawer'
import { FabricFields } from './FabricFields'
import { Button, ErrorNotice, Field, Input, Loading, Notice, Select, Textarea, UnitInput } from './ui'

interface RollDraft {
  tag: string
  stated: string
  received: string
  location: string
  dye_lot: string
  remnant_alert: string
  notes: string
  cost: string
  invoice_ref: string
  purchase_date: string
  included_services: string
}

interface SupplierDraft {
  name: string
  phone: string
  building: string
  stall: string
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())

const emptyRoll = (): RollDraft => ({
  tag: '',
  stated: '',
  received: '',
  location: '',
  dye_lot: '',
  remnant_alert: '',
  notes: '',
  cost: '',
  invoice_ref: '',
  purchase_date: today(),
  included_services: '',
})

/**
 * Everything that happens when a roll arrives, in a drawer:
 * which fabric it is (existing or new), how long it really is, and what it cost.
 */
export function ReceiveRollDrawer({ onClose, presetFabricId = '' }: { onClose: () => void; presetFabricId?: string }) {
  const lookups = useLookups()
  const fabrics = useQuery({ queryKey: ['fabrics', 'receive'], queryFn: () => api.fabrics() })
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [fabricMode, setFabricMode] = useState<'existing' | 'new'>('existing')
  const [fabricId, setFabricId] = useState(presetFabricId)
  const [fabricFilter, setFabricFilter] = useState('')
  const [fabricDraft, setFabricDraft] = useState<FabricDraft>(emptyFabricDraft)
  const [supplierMode, setSupplierMode] = useState<'none' | 'existing' | 'new'>('none')
  const [supplierId, setSupplierId] = useState('')
  const [supplier, setSupplier] = useState<SupplierDraft>({ name: '', phone: '', building: '', stall: '' })
  const [roll, setRoll] = useState<RollDraft>(emptyRoll)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState<Roll | null>(null)

  const setR = <K extends keyof RollDraft>(k: K, v: RollDraft[K]) => setRoll((r) => ({ ...r, [k]: v }))
  const setS = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) => setSupplier((s) => ({ ...s, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!lookups.data || !fabrics.data) return
    setProblem(null)

    const clientErrors: Record<string, string> = {}
    const body: Record<string, unknown> = {
      tag: roll.tag.trim() || null,
      dye_lot: roll.dye_lot,
      location: roll.location,
      notes: roll.notes,
      invoice_ref: roll.invoice_ref,
      purchase_date: roll.purchase_date || null,
      included_services: roll.included_services,
    }

    if (mode === 'existing') {
      if (!fabricId) clientErrors.fabric_id = 'Choose the fabric, or switch to "New fabric".'
      body.fabric_id = Number(fabricId)
    } else {
      const { payload, errors } = draftToFabricPayload(fabricDraft)
      for (const [k, v] of Object.entries(errors)) clientErrors[`fabric.${k}`] = v
      body.fabric = payload
    }

    if (receivedCm === null || receivedCm <= 0) clientErrors.received_cm = 'Enter the length you measured, in metres, e.g. 50 or 48.5'
    body.received_cm = receivedCm
    if (roll.stated.trim() && statedCm === null) clientErrors.stated_cm = 'Enter metres, e.g. 50'
    body.stated_cm = statedCm
    if (costCents === null) clientErrors.cost_cents = 'Enter what was paid for this roll, in shillings (0 if unknown).'
    body.cost_cents = costCents
    const alertCm = roll.remnant_alert.trim() ? metresToCm(roll.remnant_alert) : null
    if (roll.remnant_alert.trim() && alertCm === null) clientErrors.remnant_alert_cm = 'Enter metres, e.g. 3'
    body.remnant_alert_cm = alertCm

    if (supplierMode === 'existing') {
      if (!supplierId) clientErrors.supplier_id = 'Choose the supplier.'
      body.supplier_id = Number(supplierId)
    } else if (supplierMode === 'new') {
      if (!supplier.name.trim()) clientErrors['supplier.name'] = 'Enter the supplier or shop name.'
      body.supplier = { ...supplier, phone: supplier.phone.trim() || null }
    }

    if (Object.keys(clientErrors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: clientErrors })
      return
    }

    setBusy(true)
    try {
      const created = await api.receiveRoll(body)
      setReceived(created)
      qc.invalidateQueries({ queryKey: ['rolls'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['fabrics'] })
      qc.invalidateQueries({ queryKey: ['lookups'] })
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  function receiveAnother(sameFabric: boolean) {
    if (sameFabric && received?.fabric) {
      setFabricMode('existing')
      setFabricId(String(received.fabric.id))
    } else {
      setFabricId('')
      setFabricDraft(emptyFabricDraft)
    }
    setRoll((r) => ({ ...emptyRoll(), location: r.location, purchase_date: r.purchase_date, invoice_ref: sameFabric ? r.invoice_ref : '' }))
    if (sameFabric && received?.supplier) {
      setSupplierMode('existing')
      setSupplierId(String(received.supplier.id))
    }
    setReceived(null)
    setProblem(null)
  }

  if (lookups.isLoading || fabrics.isLoading) {
    return (
      <Drawer onClose={onClose} title="Receive a fabric roll">
        <Loading />
      </Drawer>
    )
  }

  if (lookups.error || fabrics.error || !lookups.data || !fabrics.data) {
    return (
      <Drawer onClose={onClose} title="Receive a fabric roll">
        <ErrorNotice problem={toProblem(lookups.error ?? fabrics.error)} onRetry={() => { lookups.refetch(); fabrics.refetch() }} />
      </Drawer>
    )
  }

  const allFabrics = fabrics.data
  const noFabricsYet = allFabrics.length === 0
  const mode = noFabricsYet ? 'new' : fabricMode
  const filterText = fabricFilter.trim().toLowerCase()
  const shownFabrics = filterText
    ? allFabrics.filter((f) => `${f.code} ${f.display_name} ${f.category?.name}`.toLowerCase().includes(filterText))
    : allFabrics

  const statedCm = roll.stated.trim() ? metresToCm(roll.stated) : null
  const receivedCm = roll.received.trim() ? metresToCm(roll.received) : null
  const costCents = roll.cost.trim() ? shillingsToCents(roll.cost) : null
  const lengthDiff = statedCm !== null && receivedCm !== null ? receivedCm - statedCm : null
  const costPerMetre = costCents !== null && receivedCm ? Math.round((costCents * 100) / receivedCm) : null

  const f = problem?.fields ?? {}

  return (
    <Drawer
      onClose={onClose}
      size="lg"
      title={received ? 'Roll received' : 'Receive a fabric roll'}
      description={received ? undefined : 'Measure the roll yourself. Record what the supplier said separately.'}
      footer={
        received ? (
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="tabular text-sm text-ink-muted">
              {receivedCm ? (
                <>
                  Adding <strong className="text-plum">{formatMetres(receivedCm)}</strong> to stock
                </>
              ) : (
                'Enter the measured length to continue'
              )}
            </p>
            <Button type="submit" form="receive-roll-form" busy={busy} className="sm:min-w-40">
              Save roll
            </Button>
          </div>
        )
      }
    >
      {received ? (
        <>
          <div className="rounded-2xl border border-line-soft bg-blush-50 p-4">
            <p className="text-sm font-semibold text-ink-muted">Write this tag on the roll</p>
            <p className="mt-1 font-mono text-5xl font-bold tracking-wider text-plum">{received.tag}</p>
            <p className="mt-3 font-semibold">{received.fabric?.display_name}</p>
            <p className="tabular text-ink-muted">{formatMetres(received.balance_cm)} in stock</p>
          </div>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => receiveAnother(true)}>Receive another roll of this fabric</Button>
            <Button variant="secondary" onClick={() => receiveAnother(false)}>
              Receive a different fabric
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onClose()
                navigate(`/rolls/${received.id}`)
              }}
            >
              Open roll {received.tag}
            </Button>
          </div>
        </>
      ) : (
        <form id="receive-roll-form" onSubmit={submit} className="grid gap-4" noValidate>
          <Section step={1} title="Which fabric is it?">
            {!noFabricsYet && (
              <Toggle
                value={mode}
                onChange={(v) => setFabricMode(v as 'existing' | 'new')}
                options={[
                  ['existing', 'Fabric we already stock'],
                  ['new', 'New fabric'],
                ]}
              />
            )}
            {mode === 'existing' ? (
              <div className="mt-4 grid gap-3">
                <Field label="Find fabric">
                  {(a) => <Input {...a} type="search" value={fabricFilter} onChange={(e) => setFabricFilter(e.target.value)} placeholder="Code, colour, material…" />}
                </Field>
                <Field label="Fabric" error={f.fabric_id}>
                  {(a) => (
                    <Select {...a} value={fabricId} onChange={(e) => setFabricId(e.target.value)} size={Math.min(6, Math.max(3, shownFabrics.length + 1))} className="h-auto py-1">
                      <option value="" disabled>
                        {shownFabrics.length ? 'Choose a fabric…' : 'No fabric matches'}
                      </option>
                      {shownFabrics.map((fab) => (
                        <option key={fab.id} value={fab.id} className="py-1.5">
                          {fab.code} · {fab.display_name} ({fab.category?.name})
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : (
              <div className="mt-4">
                {noFabricsYet && <p className="mb-4 text-sm text-ink-muted">This is the first roll, so describe its fabric. Next time you can just pick it.</p>}
                <FabricFields draft={fabricDraft} onChange={setFabricDraft} lookups={lookups.data} errors={nestedErrors(f, 'fabric.')} />
              </div>
            )}
          </Section>

          <Section step={2} title="The roll">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Length you measured" error={f.received_cm}>
                {(a) => <UnitInput {...a} unit="m" value={roll.received} onChange={(e) => setR('received', e.target.value)} placeholder="e.g. 48.5" />}
              </Field>
              <Field label="Length the supplier said" error={f.stated_cm} hint="Optional">
                {(a) => <UnitInput {...a} unit="m" value={roll.stated} onChange={(e) => setR('stated', e.target.value)} placeholder="e.g. 50" />}
              </Field>
              {lengthDiff !== null && lengthDiff !== 0 && (
                <div className="sm:col-span-2">
                  <Notice tone="warn">
                    The roll is <strong>{formatMetres(Math.abs(lengthDiff))} {lengthDiff < 0 ? 'shorter' : 'longer'}</strong> than the supplier said. Stock will use the length you measured.
                  </Notice>
                </div>
              )}
              <Field label="Tag" error={f.tag} hint="Leave empty for an automatic tag (R00001…). Type one only if the roll is already labelled.">
                {(a) => <Input {...a} value={roll.tag} onChange={(e) => setR('tag', e.target.value)} autoCapitalize="characters" />}
              </Field>
              <Field label="Where is it kept?" error={f.location} hint="e.g. Main shop, Store, Workroom">
                {(a) => (
                  <>
                    <Input {...a} value={roll.location} onChange={(e) => setR('location', e.target.value)} list="roll-locations" placeholder="Main shop" />
                    <datalist id="roll-locations">
                      {lookups.data.locations.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Dye lot / batch" error={f.dye_lot} hint="Optional. Rolls from different batches can differ slightly in shade.">
                {(a) => <Input {...a} value={roll.dye_lot} onChange={(e) => setR('dye_lot', e.target.value)} />}
              </Field>
              <Field label="Warn me when this roll drops to" error={f.remnant_alert_cm} hint="Optional">
                {(a) => <UnitInput {...a} unit="m" value={roll.remnant_alert} onChange={(e) => setR('remnant_alert', e.target.value)} />}
              </Field>
              <Field label="Notes" error={f.notes} className="sm:col-span-2" hint="Optional, e.g. small flaw at 12 m">
                {(a) => <Textarea {...a} rows={2} value={roll.notes} onChange={(e) => setR('notes', e.target.value)} />}
              </Field>
            </div>
          </Section>

          <Section step={3} title="Purchase">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Total paid for this roll"
                error={f.cost_cents}
                hint={costPerMetre !== null ? `That is ${formatKes(costPerMetre)} per measured metre.` : 'Only the owner and manager can see this.'}
              >
                {(a) => <UnitInput {...a} unit="KES" unitFirst value={roll.cost} onChange={(e) => setR('cost', e.target.value)} placeholder="e.g. 20,000" />}
              </Field>
              <Field label="Purchase date" error={f.purchase_date}>
                {(a) => <Input {...a} type="date" max={today()} value={roll.purchase_date} onChange={(e) => setR('purchase_date', e.target.value)} />}
              </Field>
              <Field label="Receipt / invoice number" error={f.invoice_ref} hint="Optional">
                {(a) => <Input {...a} value={roll.invoice_ref} onChange={(e) => setR('invoice_ref', e.target.value)} />}
              </Field>
              <Field label="Included in the price" error={f.included_services} hint="Optional, e.g. delivery, transport">
                {(a) => <Input {...a} value={roll.included_services} onChange={(e) => setR('included_services', e.target.value)} />}
              </Field>
            </div>

            <p className="mt-5 mb-2 text-sm font-semibold text-plum-700">Supplier</p>
            <Toggle
              value={supplierMode}
              onChange={(v) => setSupplierMode(v as typeof supplierMode)}
              options={[
                ['none', 'Skip'],
                ...(lookups.data.suppliers.length ? ([['existing', 'Known supplier']] as [string, string][]) : []),
                ['new', 'New supplier'],
              ]}
            />
            {supplierMode === 'existing' && (
              <div className="mt-3">
                <Field label="Supplier" error={f.supplier_id}>
                  {(a) => (
                    <Select {...a} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">Choose…</option>
                      {lookups.data.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {[s.name, s.building, s.stall].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}
            {supplierMode === 'new' && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Supplier / shop name" error={f['supplier.name']}>
                  {(a) => <Input {...a} value={supplier.name} onChange={(e) => setS('name', e.target.value)} />}
                </Field>
                <Field label="Phone" error={f['supplier.phone']} hint="Optional">
                  {(a) => <Input {...a} type="tel" inputMode="tel" value={supplier.phone} onChange={(e) => setS('phone', e.target.value)} placeholder="0712 345 678" />}
                </Field>
                <Field label="Building" error={f['supplier.building']} hint="Optional, e.g. Garissa Lodge">
                  {(a) => <Input {...a} value={supplier.building} onChange={(e) => setS('building', e.target.value)} />}
                </Field>
                <Field label="Stall" error={f['supplier.stall']} hint="Optional">
                  {(a) => <Input {...a} value={supplier.stall} onChange={(e) => setS('stall', e.target.value)} />}
                </Field>
              </div>
            )}
          </Section>

          {problem && <ErrorNotice problem={problem} />}
        </form>
      )}
    </Drawer>
  )
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-2xl border border-line-soft bg-white p-4 shadow-card sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-3" aria-hidden>
        <span className="grid size-8 place-items-center rounded-full bg-blush-200 font-bold text-rose-dark">{step}</span>
        <span className="font-display text-xl text-plum">{title}</span>
      </div>
      {children}
    </fieldset>
  )
}

function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div role="radiogroup" className="inline-flex w-full rounded-xl bg-blush-200 p-1 sm:w-auto">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx('min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:flex-none', value === v ? 'bg-white text-plum shadow-sm' : 'text-ink-muted')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
