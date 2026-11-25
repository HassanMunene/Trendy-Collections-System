// Shapes returned by the Laravel API (backend/app/Http/Resources). Lengths in cm, money in cents.

export type Role = 'owner' | 'manager' | 'cashier' | 'cutter' | 'tailor'

export interface Permissions {
  manage_staff: boolean
  manage_catalogue: boolean
  receive_stock: boolean
  adjust_stock: boolean
  view_costs: boolean
  view_audit: boolean
  sell: boolean
  void_sales: boolean
  record_sewing: boolean
}

export interface StaffUser {
  id: number
  name: string
  username: string
  phone: string | null
  avatar_url: string | null
  role: string
  role_label: string
  is_superadmin: boolean
  active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string | null
}

export interface Me extends StaffUser {
  permissions: Permissions
  /** How long the server keeps an idle session, in seconds. */
  session_lifetime_seconds: number
}

export interface Term {
  id: number
  name: string
  active: boolean
}

export interface RoleOption {
  key: string
  label: string
  builtin: boolean
  locked: boolean
}

export interface PermissionInfo {
  key: string
  label: string
  description: string
  assignable: boolean
}

export interface RolePermissionRole {
  key: string
  label: string
  description: string
  builtin: boolean
  locked: boolean
  members: number
  permissions: string[]
}

export interface RolePermissionsData {
  permissions: PermissionInfo[]
  roles: RolePermissionRole[]
}

export interface AuditActor {
  id: number
  name: string
  username: string
  role: string
  is_superadmin: boolean
  avatar_url: string | null
}

export interface AuditEvent {
  id: number
  action: string
  entity_type: string
  entity_id: number | null
  details: Record<string, unknown>
  actor: AuditActor | null
  ip_address: string | null
  created_at: string | null
}

export interface Supplier {
  id: number
  name: string
  phone: string | null
  building: string
  stall: string
  notes: string
  active: boolean
  created_at: string | null
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

export type MovementKind = 'receipt' | 'adjustment' | 'cut' | 'sale' | 'return' | 'transfer' | 'reversal'

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

export interface StockItem {
  id: number
  name: string
  sku: string | null
  is_product: boolean
  category?: { id: number; name: string } | null
  colour?: { id: number; name: string } | null
  variant: string
  /** Asking price per unit; the agreed price is typed at the counter. */
  price_cents: number | null
  tracks_stock: boolean
  unit: string
  quantity: number
  reorder_level: number | null
  cost_cents?: number // hidden from staff without view_costs
  supplier?: Supplier | null // hidden from staff without view_costs
  location: string
  notes: string
  active: boolean
  is_low: boolean
  received_by?: { id: number; name: string }
  created_at: string | null
}

export type StockItemMovementKind = 'receipt' | 'adjustment' | 'issue' | 'return' | 'transfer' | 'sale' | 'production' | 'reversal'

export interface StockItemMovement {
  id: number
  kind: StockItemMovementKind
  change_qty: number
  balance_after: number
  note: string
  actor?: { id: number; name: string }
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
  sales_today?: { count: number; total_cents: number }
  low_products: StockItem[]
}

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: number }
}

export interface ProductCategory {
  id: number
  name: string
  unit: string
  tracks_stock: boolean
  sort_order: number
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  stall: string
  notes: string
  active: boolean
  /** Goods taken on "to pay" and not yet settled. */
  owed_cents: number
  last_sale_at: string | null
  created_at: string | null
}

export type PaymentMethod = 'cash' | 'send_money' | 'paybill' | 'account'

export interface SaleLine {
  id: number
  kind: 'product' | 'fabric'
  stock_item_id: number | null
  roll_id: number | null
  description: string
  quantity: number | null
  length_cm: number | null
  unit: string
  asking_unit_cents: number | null
  asking_total_cents: number | null
  total_cents: number
}

export interface SalePayment {
  id: number
  method: PaymentMethod
  method_label: string
  amount_cents: number
  mpesa_code: string | null
  voided: boolean
}

export interface Sale {
  id: number
  number: string
  customer?: { id: number; name: string; stall: string } | null
  customer_name: string
  total_cents: number
  note: string
  status: 'posted' | 'voided'
  sold_by?: { id: number; name: string }
  voided_by?: { id: number; name: string } | null
  voided_at: string | null
  void_reason: string
  lines?: SaleLine[]
  payments?: SalePayment[]
  created_at: string | null
}

export interface DayBook {
  date: string
  weekday: string
  sales: Sale[]
  totals: {
    total_cents: number
    by_method: Record<PaymentMethod, number>
    method_labels: Record<PaymentMethod, string>
    sales_count: number
    voided_count: number
    missing_mpesa_codes: number
    below_asking_cents: number
  }
}

export interface PriceHint {
  customer: string | null
  customer_last: { unit_cents: number; quantity: number; total_cents: number; sold_at: string } | null
  recent: { unit_cents: number; quantity: number; total_cents: number; sold_at: string }[]
}

export interface SewingBatch {
  id: number
  sewn_by?: { id: number; name: string }
  recorded_by?: { id: number; name: string }
  note: string
  inputs?: { roll_id: number; roll_tag: string; fabric: string; used_cm: number }[]
  outputs?: { stock_item_id: number; name: string; unit: string; quantity: number }[]
  created_at: string | null
}

export interface SaleBody {
  customer_id?: number | null
  customer_name?: string
  note?: string
  lines: ({ stock_item_id: number; quantity: number; total_cents: number } | { roll_id: number; length_cm: number; total_cents: number })[]
  payments: { method: PaymentMethod; amount_cents: number; mpesa_code?: string | null }[]
}
