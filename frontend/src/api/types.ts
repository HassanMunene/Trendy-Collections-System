// Shapes returned by the Laravel API (backend/app/Http/Resources). Lengths in cm, money in cents.

export type Role = 'owner' | 'manager' | 'cashier' | 'cutter' | 'tailor'

export interface Permissions {
  manage_staff: boolean
  manage_catalogue: boolean
  receive_stock: boolean
  adjust_stock: boolean
  view_costs: boolean
}

export interface StaffUser {
  id: number
  name: string
  username: string
  phone: string | null
  role: Role
  is_superadmin: boolean
  active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string | null
}

export interface Me extends StaffUser {
  permissions: Permissions
}

export interface Term {
  id: number
  name: string
  active: boolean
}

export interface Supplier {
  id: number
  name: string
  phone: string | null
  building: string
  stall: string
}

export type Opacity = '' | 'sheer' | 'light_filtering' | 'dim_out' | 'blackout'

export interface Fabric {
  id: number
  code: string
  display_name: string
  category?: Term
  material_type?: Term
  texture?: Term
  colour?: Term
  design: string
  shade_code: string
  opacity: Opacity
  width_cm: number | null
  weight_gsm: number | null
  care_instructions: string
  retail_price_cents_per_m: number | null
  reorder_threshold_cm: number | null
  active: boolean
  rolls_in_stock?: number
  balance_cm?: number
}

export type RollStatus = 'active' | 'finished' | 'written_off'

export interface Roll {
  id: number
  tag: string
  fabric?: Fabric
  supplier?: Supplier | null // hidden from staff without view_costs
  stated_cm: number | null
  received_cm: number
  balance_cm: number
  cost_cents?: number // hidden from staff without view_costs
  dye_lot: string
  invoice_ref?: string
  purchase_date: string | null
  location: string
  included_services: string
  remnant_alert_cm: number | null
  notes: string
  status: RollStatus
  is_low: boolean | null
  received_by?: { id: number; name: string }
  created_at: string | null
}

export type MovementKind = 'receipt' | 'adjustment' | 'cut' | 'sale' | 'return' | 'transfer'

export interface Movement {
  id: number
  kind: MovementKind
  change_cm: number
  balance_after_cm: number
  note: string
  actor?: { id: number; name: string }
  roll?: { id: number; tag: string }
  created_at: string | null
}

export interface Adjustment {
  id: number
  before_cm: number
  after_cm: number
  reason: string
  actor: { id: number; name: string }
  created_at: string | null
}

export interface Lookups {
  categories: Term[]
  material_types: Term[]
  textures: Term[]
  colours: Term[]
  suppliers: Supplier[]
  locations: string[]
}

export type LookupType = 'categories' | 'material_types' | 'textures' | 'colours'

export interface Dashboard {
  active_rolls: number
  balance_cm: number
  by_category: { id: number; name: string; rolls: number; balance_cm: number }[]
  received_this_week: { rolls: number; cm: number }
  corrections_today: number
  low_rolls: Roll[]
  recent_movements: Movement[]
  stock_value_cents?: number
}

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: number }
}
