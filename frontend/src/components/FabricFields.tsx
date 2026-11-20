import type { Lookups, Opacity } from '../api/types'
import type { FabricDraft } from '../lib/fabricDraft'
import { TermSelect } from './TermSelect'
import { Field, Input, Select, UnitInput } from './ui'

export function FabricFields({
  draft,
  onChange,
  lookups,
  errors,
  showCode = true,
}: {
  draft: FabricDraft
  onChange: (d: FabricDraft) => void
  lookups: Lookups
  errors: Record<string, string>
  showCode?: boolean
}) {
  const set = <K extends keyof FabricDraft>(key: K, value: FabricDraft[K]) => onChange({ ...draft, [key]: value })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TermSelect type="categories" label="Category" terms={lookups.categories} value={draft.fabric_category_id} onChange={(v) => set('fabric_category_id', v)} error={errors.fabric_category_id} />
      <TermSelect type="colours" label="Colour" terms={lookups.colours} value={draft.colour_id} onChange={(v) => set('colour_id', v)} error={errors.colour_id} />
      <TermSelect type="material_types" label="Material" terms={lookups.material_types} value={draft.material_type_id} onChange={(v) => set('material_type_id', v)} error={errors.material_type_id} />
      <TermSelect type="textures" label="Texture / finish" terms={lookups.textures} value={draft.texture_id} onChange={(v) => set('texture_id', v)} error={errors.texture_id} />
      <Field label="Design or pattern name" error={errors.design} hint="Optional, e.g. Damask, Floral, Stripe">
        {(a) => <Input {...a} value={draft.design} onChange={(e) => set('design', e.target.value)} />}
      </Field>
      <Field label="Light" error={errors.opacity}>
        {(a) => (
          <Select {...a} value={draft.opacity} onChange={(e) => set('opacity', e.target.value as Opacity)}>
            <option value="">Not recorded</option>
            <option value="sheer">Sheer (see-through)</option>
            <option value="light_filtering">Light filtering</option>
            <option value="dim_out">Dim-out</option>
            <option value="blackout">Blackout</option>
          </Select>
        )}
      </Field>
      <Field label="Fabric width" error={errors.width_cm} hint="Across the roll">
        {(a) => <UnitInput {...a} unit="cm" inputMode="numeric" value={draft.width_cm} onChange={(e) => set('width_cm', e.target.value)} />}
      </Field>
      <Field label="Selling price per metre" error={errors.retail_price_cents_per_m} hint="Optional">
        {(a) => <UnitInput {...a} unit="KES" unitFirst value={draft.retail_price} onChange={(e) => set('retail_price', e.target.value)} />}
      </Field>
      <Field label="Warn me when a roll of this fabric drops to" error={errors.reorder_threshold_cm} hint="Optional">
        {(a) => <UnitInput {...a} unit="m" value={draft.reorder_threshold} onChange={(e) => set('reorder_threshold', e.target.value)} />}
      </Field>
      <Field label="Shade / supplier colour code" error={errors.shade_code} hint="Optional">
        {(a) => <Input {...a} value={draft.shade_code} onChange={(e) => set('shade_code', e.target.value)} />}
      </Field>
      <Field label="Weight" error={errors.weight_gsm} hint="Optional, grams per m²">
        {(a) => <UnitInput {...a} unit="gsm" inputMode="numeric" value={draft.weight_gsm} onChange={(e) => set('weight_gsm', e.target.value)} />}
      </Field>
      {showCode && (
        <Field label="Fabric code" error={errors.code} hint="Leave empty to get one automatically (F0001…)">
          {(a) => <Input {...a} value={draft.code} onChange={(e) => set('code', e.target.value)} autoCapitalize="characters" />}
        </Field>
      )}
      <Field label="Care instructions" error={errors.care_instructions} className="sm:col-span-2" hint="Optional">
        {(a) => <Input {...a} value={draft.care_instructions} onChange={(e) => set('care_instructions', e.target.value)} />}
      </Field>
    </div>
  )
}
