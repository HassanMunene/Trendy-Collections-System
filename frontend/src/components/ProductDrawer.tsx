import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { StockItem } from '../api/types'
import { useCan } from '../auth/useMe'
import { productName, PRODUCTS_KEY, quantityLabel, useProductCategories } from '../lib/useCatalogue'
import { useLookups } from '../lib/useLookups'
import { formatKes, shillingsToCents } from '../lib/units'
import { Drawer } from './Drawer'
import { TermSelect } from './TermSelect'
import { useToast } from './toast-context'
import { Button, DetailList, ErrorNotice, Field, Input, Notice, Pill, Select, Swatch, Textarea, UnitInput } from './ui'

const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100))

/** Add a product, or open one to edit it, add stock or correct the shelf count. */
export function ProductDrawer({ product, onClose }: { product: StockItem | null; onClose: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'receive' | 'count'>(product ? 'view' : 'edit')
  const [current, setCurrent] = useState<StockItem | null>(product)

  if (!current || mode === 'edit') {
    return (
      <ProductForm
        product={current}
        onClose={current ? () => setMode('view') : onClose}
        onSaved={(saved) => {
          setCurrent(saved)
          setMode('view')
        }}
      />
    )
  }
  if (mode === 'receive' || mode === 'count') {
    return (
      <StockChangeForm
        product={current}
        mode={mode}
        onClose={() => setMode('view')}
        onSaved={(saved) => {
          setCurrent(saved)
          setMode('view')
        }}
      />
    )
  }
  return <ProductView product={current} onClose={onClose} onAction={setMode} />
}

function ProductView({ product, onClose, onAction }: { product: StockItem; onClose: () => void; onAction: (mode: 'edit' | 'receive' | 'count') => void }) {
  const canEdit = useCan('manage_catalogue')
  const canReceive = useCan('receive_stock')
  const canCount = useCan('adjust_stock')
  const counted = product.tracks_stock

  return (
    <Drawer
      onClose={onClose}
      title={product.name}
      description={product.category?.name}
      footer={
        <>
          {counted && canCount && (
            <Button variant="secondary" onClick={() => onAction('count')}>
              Correct count
            </Button>
          )}
          {counted && canReceive && (
            <Button variant="secondary" onClick={() => onAction('receive')}>
              Add stock
            </Button>
          )}
          {canEdit && <Button onClick={() => onAction('edit')}>Edit</Button>}
        </>
      }
    >
      <div className="mb-5 rounded-2xl border border-line-soft bg-blush-50 p-4">
        <p className="text-sm font-semibold text-ink-muted">{counted ? 'On the shelf' : 'Service'}</p>
        <p className="tabular mt-1 font-display text-3xl text-plum">
          {counted ? quantityLabel(product.quantity, product.unit) : 'Not counted'}
        </p>
        {product.is_low && <Pill tone="warn">Running low</Pill>}
      </div>
      <DetailList
        items={[
          ['Asking price', product.price_cents === null ? 'Not set' : `${formatKes(product.price_cents)} per ${product.unit}`],
          ['Colour', product.colour ? <span className="inline-flex items-center gap-2"><Swatch name={product.colour.name} />{product.colour.name}</span> : '—'],
          ['Type / size', product.variant],
          ['Warn when down to', product.reorder_level === null ? '—' : quantityLabel(product.reorder_level, product.unit)],
          ...(product.cost_cents !== undefined ? ([['Cost per unit', formatKes(product.cost_cents)]] as [string, string][]) : []),
          ['Kept at', product.location],
          ['Code', product.sku ?? ''],
          ['Notes', product.notes],
          ['Status', product.active ? 'For sale' : 'Hidden from the counter'],
        ]}
      />
    </Drawer>
  )
}

function ProductForm({ product, onClose, onSaved }: { product: StockItem | null; onClose: () => void; onSaved: (p: StockItem) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const categories = useProductCategories()
  const lookups = useLookups()
  const canReceive = useCan('receive_stock')
  const canSeeCosts = useCan('view_costs')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    category: product?.category ? String(product.category.id) : '',
    colour: product?.colour ? String(product.colour.id) : '',
    variant: product?.variant ?? '',
    price: centsToInput(product?.price_cents),
    cost: centsToInput(product?.cost_cents),
    opening: '',
    reorder: product?.reorder_level === null || product?.reorder_level === undefined ? '' : String(product.reorder_level),
    notes: product?.notes ?? '',
    active: product?.active ?? true,
  })
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const f = problem?.fields ?? {}

  const category = categories.data?.find((c) => String(c.id) === draft.category)
  const colour = lookups.data?.colours.find((c) => String(c.id) === draft.colour)
  const preview = category ? productName(category.name, colour?.name, draft.variant) : ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    const errors: Record<string, string> = {}
    const price = draft.price.trim() ? shillingsToCents(draft.price) : null
    const cost = draft.cost.trim() ? shillingsToCents(draft.cost) : null
    const opening = draft.opening.trim() ? Number(draft.opening) : 0
    if (!category) errors.product_category_id = 'Choose what kind of product this is.'
    if (draft.price.trim() && price === null) errors.price_cents = 'Enter the asking price in shillings, e.g. 2,200'
    if (draft.cost.trim() && cost === null) errors.cost_cents = 'Enter the cost in shillings.'
    if (!Number.isInteger(opening) || opening < 0) errors.opening_quantity = 'Enter a whole number, e.g. 6'
    if (draft.reorder.trim() && (!Number.isInteger(Number(draft.reorder)) || Number(draft.reorder) < 0)) errors.reorder_level = 'Enter a whole number.'
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }

    const body: Record<string, unknown> = {
      product_category_id: Number(draft.category),
      colour_id: draft.colour ? Number(draft.colour) : null,
      variant: draft.variant.trim(),
      price_cents: price,
      reorder_level: draft.reorder.trim() ? Number(draft.reorder) : null,
      notes: draft.notes.trim(),
    }
    if (canSeeCosts) body.cost_cents = cost ?? 0
    if (product) body.active = draft.active
    else if (opening > 0) body.opening_quantity = opening

    setBusy(true)
    try {
      const saved = product ? await api.updateProduct(product.id, body) : await api.createProduct(body)
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(product ? 'Product saved.' : `${saved.name} added.`)
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
      title={product ? 'Edit product' : 'Add a product'}
      description="One product per kind, colour and type, e.g. a grey blackout window curtain."
      footer={
        <Button type="submit" form="product-form" busy={busy}>
          Save product
        </Button>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="What is it?" error={f.product_category_id}>
          {(a) => (
            <Select {...a} value={draft.category} onChange={(e) => set('category', e.target.value)} autoFocus={!product}>
              <option value="">Choose…</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.tracks_stock ? `sold by the ${c.unit}` : 'service'})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <TermSelect type="colours" label="Colour" terms={lookups.data?.colours ?? []} value={draft.colour} onChange={(v) => set('colour', v)} error={f.colour_id} />
          <Field label="Type, pattern or size" error={f.variant} hint="Optional, e.g. Blackout, Mizimizi, Big size, 3 m gold">
            {(a) => <Input {...a} value={draft.variant} onChange={(e) => set('variant', e.target.value)} />}
          </Field>
        </div>

        {preview && (
          <Notice>
            Staff will see it as <strong>{preview}</strong>.
          </Notice>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asking price" error={f.price_cents} hint={category ? `Per ${category.unit}. Staff can agree a different price at the counter.` : 'Staff can agree a different price at the counter.'}>
            {(a) => <UnitInput {...a} unit="KES" unitFirst value={draft.price} onChange={(e) => set('price', e.target.value)} placeholder="e.g. 2,200" />}
          </Field>
          {canSeeCosts && (
            <Field label="Cost per unit" error={f.cost_cents} hint="Optional. Only owner and manager see this.">
              {(a) => <UnitInput {...a} unit="KES" unitFirst value={draft.cost} onChange={(e) => set('cost', e.target.value)} />}
            </Field>
          )}
          {category?.tracks_stock !== false && !product && canReceive && (
            <Field label="How many are on the shelf now?" error={f.opening_quantity} hint="Optional. Count them once; sewing and sales keep it right after that.">
              {(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} value={draft.opening} onChange={(e) => set('opening', e.target.value)} placeholder="e.g. 6" />}
            </Field>
          )}
          {category?.tracks_stock !== false && (
            <Field label="Warn me when down to" error={f.reorder_level} hint="Optional">
              {(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} value={draft.reorder} onChange={(e) => set('reorder', e.target.value)} placeholder="e.g. 2" />}
            </Field>
          )}
        </div>

        <Field label="Notes" error={f.notes} hint="Optional">
          {(a) => <Textarea {...a} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>

        {product && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-rose" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
            Show at the counter
          </label>
        )}

        {problem && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}

function StockChangeForm({ product, mode, onClose, onSaved }: { product: StockItem; mode: 'receive' | 'count'; onClose: () => void; onSaved: (p: StockItem) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const f = problem?.fields ?? {}
  const isCount = mode === 'count'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    const n = Number(value)
    if (!value.trim() || !Number.isInteger(n) || n < (isCount ? 0 : 1)) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { [isCount ? 'counted' : 'quantity']: 'Enter a whole number.' } })
      return
    }
    if (isCount && !note.trim()) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: { reason: 'Say why the count is different.' } })
      return
    }
    setBusy(true)
    try {
      const saved = isCount ? await api.countItem(product.id, { counted: n, reason: note.trim() }) : await api.restockItem(product.id, { quantity: n, note: note.trim() })
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${saved.name}: ${quantityLabel(saved.quantity, saved.unit)} on the shelf.`)
      onSaved({ ...product, ...saved })
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={isCount ? 'Correct the count' : 'Add stock'}
      description={`${product.name} · ${quantityLabel(product.quantity, product.unit)} on the shelf now`}
      footer={
        <Button type="submit" form="stock-change-form" busy={busy}>
          Save
        </Button>
      }
    >
      <form id="stock-change-form" onSubmit={submit} className="grid gap-4" noValidate>
        {!isCount && <Notice>Use this for goods bought in ready-made. Curtains and cases sewn in the shop are added from <strong>Sewing</strong>, so the fabric comes off its roll too.</Notice>}
        <Field label={isCount ? 'How many are really on the shelf?' : 'How many came in?'} error={isCount ? f.counted : f.quantity}>
          {(a) => <Input {...a} type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />}
        </Field>
        <Field label={isCount ? 'Why is it different?' : 'Note'} error={f.reason ?? f.note} hint={isCount ? 'Kept in the history with your name.' : 'Optional, e.g. supplier'}>
          {(a) => <Input {...a} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {problem && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
