import type { Fabric, Opacity } from '../api/types'
import { cmToMetreInput, metresToCm, shillingsToCents } from './units'

/** Form state for a fabric: everything is a string while typing. */
export interface FabricDraft {
  code: string
  fabric_category_id: string
  material_type_id: string
  texture_id: string
  colour_id: string
  design: string
  shade_code: string
  opacity: Opacity
  width_cm: string
  weight_gsm: string
  care_instructions: string
  retail_price: string
  reorder_threshold: string
}

export const emptyFabricDraft: FabricDraft = {
  code: '',
  fabric_category_id: '',
  material_type_id: '',
  texture_id: '',
  colour_id: '',
  design: '',
  shade_code: '',
  opacity: '',
  width_cm: '',
  weight_gsm: '',
  care_instructions: '',
  retail_price: '',
  reorder_threshold: '',
}

export function fabricToDraft(f: Fabric): FabricDraft {
  return {
    code: f.code,
    fabric_category_id: String(f.category?.id ?? ''),
    material_type_id: String(f.material_type?.id ?? ''),
    texture_id: String(f.texture?.id ?? ''),
    colour_id: String(f.colour?.id ?? ''),
    design: f.design,
    shade_code: f.shade_code,
    opacity: f.opacity,
    width_cm: f.width_cm?.toString() ?? '',
    weight_gsm: f.weight_gsm?.toString() ?? '',
    care_instructions: f.care_instructions,
    retail_price: f.retail_price_cents_per_m != null ? String(f.retail_price_cents_per_m / 100) : '',
    reorder_threshold: cmToMetreInput(f.reorder_threshold_cm),
  }
}

/** Convert to the API's units. Returns client-side errors keyed like the server's. */
export function draftToFabricPayload(d: FabricDraft): { payload: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const int = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN)

  const width = int(d.width_cm)
  if (Number.isNaN(width)) errors.width_cm = 'Whole centimetres, e.g. 280'
  const weight = int(d.weight_gsm)
  if (Number.isNaN(weight)) errors.weight_gsm = 'Whole number, e.g. 220'
  const price = d.retail_price.trim() === '' ? null : shillingsToCents(d.retail_price)
  if (price === null && d.retail_price.trim() !== '') errors.retail_price_cents_per_m = 'Enter shillings, e.g. 850'
  const reorder = d.reorder_threshold.trim() === '' ? null : metresToCm(d.reorder_threshold)
  if (reorder === null && d.reorder_threshold.trim() !== '') errors.reorder_threshold_cm = 'Enter metres, e.g. 5'

  return {
    errors,
    payload: {
      code: d.code.trim() || null,
      fabric_category_id: d.fabric_category_id ? Number(d.fabric_category_id) : null,
      material_type_id: d.material_type_id ? Number(d.material_type_id) : null,
      texture_id: d.texture_id ? Number(d.texture_id) : null,
      colour_id: d.colour_id ? Number(d.colour_id) : null,
      design: d.design,
      shade_code: d.shade_code,
      opacity: d.opacity,
      width_cm: width,
      weight_gsm: weight,
      care_instructions: d.care_instructions,
      retail_price_cents_per_m: price,
      reorder_threshold_cm: reorder,
    },
  }
}

/** Server errors for a nested "fabric.x" payload -> "x". */
export function nestedErrors(fields: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
  return out
}
