import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Roll, StockItem } from '../api/types'
import { useCan, useCurrentUser } from '../auth/useMe'
import { Drawer } from '../components/Drawer'
import { NeedleIcon, TrashIcon } from '../components/icons'
import { RollPicker } from '../components/RollPicker'
import { useToast } from '../components/toast-context'
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Notice, PageHeader, Select, Textarea, UnitInput } from '../components/ui'
import { PRODUCTS_KEY, quantityLabel, useProducts } from '../lib/useCatalogue'
import { formatDateTime, formatMetres, metresToCm } from '../lib/units'

/** Sewing for the shelf: fabric comes off its roll, finished goods go on the shelf, the tailor gets the credit. */
export function SewingPage() {
  const canRecord = useCan('record_sewing')
  const [recording, setRecording] = useState(false)
  const batches = useQuery({ queryKey: ['sewing-batches'], queryFn: () => api.sewingBatches() })
  const [weekAgo] = useState(() => Date.now() - 7 * 24 * 3600 * 1000)

  // This week's output per tailor, from what is loaded.
  const weekly = useMemo(() => {
    const byTailor = new Map<string, { pieces: number; cm: number }>()
    for (const b of batches.data ?? []) {
      if (!b.created_at || new Date(b.created_at).getTime() < weekAgo) continue
      const key = b.sewn_by?.name ?? '—'
      const row = byTailor.get(key) ?? { pieces: 0, cm: 0 }
      row.pieces += (b.outputs ?? []).reduce((s, o) => s + o.quantity, 0)
      row.cm += (b.inputs ?? []).reduce((s, i) => s + i.used_cm, 0)
      byTailor.set(key, row)
    }
    return [...byTailor.entries()]
  }, [batches.data, weekAgo])

  return (
    <>
      <PageHeader
        title="Sewing"
        subtitle="Curtains, sheers and cases sewn in the shop. Fabric used comes off its roll; what was made goes on the shelf."
        action={
          canRecord && (
            <Button onClick={() => setRecording(true)}>
              <NeedleIcon />
              Record sewing
            </Button>
          )
        }
      />

      {weekly.length > 0 && (
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Last 7 days">
          {weekly.map(([name, row]) => (
            <div key={name} className="rounded-2xl border border-line-soft bg-white p-3 shadow-card">
              <p className="truncate text-sm text-ink-muted">{name} · 7 days</p>
              <p className="tabular text-lg font-semibold text-plum">{row.pieces} made</p>
              <p className="tabular text-xs text-ink-muted">{formatMetres(row.cm)} fabric used</p>
            </div>
          ))}
        </section>
      )}

      {batches.error && <ErrorNotice problem={toProblem(batches.error)} onRetry={() => batches.refetch()} />}
      {batches.isLoading && <Loading />}
      {batches.data?.length === 0 && (
        <EmptyState title="No sewing recorded yet" action={canRecord ? <Button onClick={() => setRecording(true)}>Record sewing</Button> : undefined}>
          When a batch of curtains or cases is finished, record it here so the shelf count and the roll balance stay right.
        </EmptyState>
      )}

      <ul className="grid gap-2">
        {batches.data?.map((b) => (
          <li key={b.id} className="rounded-2xl border border-line-soft bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-plum">{b.sewn_by?.name}</p>
              <p className="text-sm text-ink-muted">{formatDateTime(b.created_at)}</p>
            </div>
            <ul className="mt-1 text-sm">
              {b.outputs?.map((o) => (
                <li key={o.stock_item_id} className="flex justify-between gap-2">
                  <span>{o.name}</span>
                  <span className="tabular font-semibold">+{quantityLabel(o.quantity, o.unit)}</span>
                </li>
              ))}
            </ul>
            {b.inputs && b.inputs.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">Fabric: {b.inputs.map((i) => `${formatMetres(i.used_cm)} of ${i.fabric} (${i.roll_tag})`).join('; ')}</p>
            )}
            {b.note && <p className="mt-1 text-xs text-ink-muted">{b.note}</p>}
            {b.recorded_by && b.sewn_by && b.recorded_by.id !== b.sewn_by.id && <p className="mt-1 text-xs text-ink-muted">Recorded by {b.recorded_by.name}</p>}
          </li>
        ))}
      </ul>

      {recording && <SewingDrawer onClose={() => setRecording(false)} />}
    </>
  )
}

interface InputDraft {
  roll: Roll
  metres: string
}
interface OutputDraft {
  productId: string
  quantity: string
}

function SewingDrawer({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser()
  const canRecordForOthers = useCan('adjust_stock')
  const qc = useQueryClient()
  const toast = useToast()
  const products = useProducts()
  const tailors = useQuery({ queryKey: ['tailors'], queryFn: api.tailors, enabled: canRecordForOthers })
  const [sewnBy, setSewnBy] = useState(String(me.id))
  const [inputs, setInputs] = useState<InputDraft[]>([])
  const [outputs, setOutputs] = useState<OutputDraft[]>([{ productId: '', quantity: '' }])
  const [note, setNote] = useState('')
  const [pickingRoll, setPickingRoll] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}

  const sewable = (products.data ?? []).filter((p: StockItem) => p.tracks_stock)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    const errors: Record<string, string> = {}
    const parsedInputs = inputs.map((i, n) => {
      const cm = metresToCm(i.metres)
      if (cm === null || cm <= 0) errors[`inputs.${n}.used_cm`] = 'Enter the metres used, e.g. 12.5'
      return { roll_id: i.roll.id, used_cm: cm ?? 0 }
    })
    const parsedOutputs = outputs.map((o, n) => {
      const q = Number(o.quantity)
      if (!o.productId) errors[`outputs.${n}.stock_item_id`] = 'Choose what was made.'
      if (!Number.isInteger(q) || q < 1) errors[`outputs.${n}.quantity`] = 'Enter how many, e.g. 4'
      return { stock_item_id: Number(o.productId), quantity: q }
    })
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    try {
      await api.recordSewing({
        sewn_by: Number(sewnBy) !== me.id ? Number(sewnBy) : undefined,
        note: note.trim(),
        inputs: parsedInputs,
        outputs: parsedOutputs,
      })
      qc.invalidateQueries({ queryKey: ['sewing-batches'] })
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['rolls'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Sewing recorded. The shelf and the rolls are updated.')
      onClose()
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  if (pickingRoll) {
    return (
      <Drawer onClose={() => setPickingRoll(false)} title="Which roll was used?">
        <RollPicker
          onPick={(roll) => {
            setInputs((is) => (is.some((i) => i.roll.id === roll.id) ? is : [...is, { roll, metres: '' }]))
            setPickingRoll(false)
          }}
        />
      </Drawer>
    )
  }

  return (
    <Drawer
      onClose={onClose}
      title="Record sewing"
      size="lg"
      footer={
        <Button type="submit" form="sewing-form" busy={busy}>
          Save
        </Button>
      }
    >
      <form id="sewing-form" onSubmit={submit} className="grid gap-5" noValidate>
        {canRecordForOthers && (
          <Field label="Sewn by" error={f.sewn_by}>
            {(a) => (
              <Select {...a} value={sewnBy} onChange={(e) => setSewnBy(e.target.value)}>
                <option value={me.id}>{me.name} (me)</option>
                {tailors.data?.filter((t) => t.id !== me.id).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-display text-lg text-plum">What was made</legend>
          {outputs.map((o, n) => (
            <div key={n} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-start gap-2">
              <Field label={n === 0 ? 'Product' : `Product ${n + 1}`} error={f[`outputs.${n}.stock_item_id`]}>
                {(a) => (
                  <Select {...a} value={o.productId} onChange={(e) => setOutputs((os) => os.map((x, i) => (i === n ? { ...x, productId: e.target.value } : x)))}>
                    <option value="">Choose…</option>
                    {sewable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="How many" error={f[`outputs.${n}.quantity`]}>
                {(a) => (
                  <Input {...a} type="number" inputMode="numeric" min={1} value={o.quantity} onChange={(e) => setOutputs((os) => os.map((x, i) => (i === n ? { ...x, quantity: e.target.value } : x)))} />
                )}
              </Field>
              <button
                type="button"
                aria-label="Remove"
                disabled={outputs.length === 1}
                onClick={() => setOutputs((os) => os.filter((_, i) => i !== n))}
                className="mt-7 grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-blush-100 disabled:opacity-30"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setOutputs((os) => [...os, { productId: '', quantity: '' }])}>
            + Another product
          </Button>
          <p className="text-xs text-ink-muted">Missing from the list? Add it under Products first.</p>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-display text-lg text-plum">Fabric used</legend>
          {inputs.length === 0 && <Notice>Add the roll(s) the fabric was cut from, so their balance stays right.</Notice>}
          {inputs.map((i, n) => (
            <div key={i.roll.id} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-start gap-2">
              <div className="pt-1">
                <p className="truncate font-semibold text-plum">{i.roll.fabric?.display_name ?? i.roll.tag}</p>
                <p className="text-xs text-ink-muted">
                  Roll {i.roll.tag} · {formatMetres(i.roll.balance_cm)} left
                </p>
              </div>
              <Field label="Metres" error={f[`inputs.${n}.used_cm`]}>
                {(a) => <UnitInput {...a} unit="m" value={i.metres} onChange={(e) => setInputs((is) => is.map((x, k) => (k === n ? { ...x, metres: e.target.value } : x)))} />}
              </Field>
              <button type="button" aria-label="Remove" onClick={() => setInputs((is) => is.filter((_, k) => k !== n))} className="mt-7 grid size-11 place-items-center rounded-lg text-ink-muted hover:bg-blush-100">
                <TrashIcon />
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setPickingRoll(true)}>
            + Add a roll
          </Button>
        </fieldset>

        <Field label="Note" hint="Optional">
          {(a) => <Textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>

        {problem && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
