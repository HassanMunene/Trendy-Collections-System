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
  take_returns: boolean
  record_expenses: boolean
  close_day: boolean
  view_reports: boolean
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
  low_products: StockItem[]
  /** Things to act on, most serious first; each links to the exact screen. */
  attention: HomeAlert[]
  /** Accounts that sell. */
  today?: HomeToday
  recent_sales?: HomeSale[]
  /** Accounts that see reports. */
  month?: HomeMonth
  /** Accounts that sew: orders waiting, soonest due first. */
  work?: HomeWork[]
}

export interface HomeAlert {
  key: string
  tone: 'danger' | 'warn' | 'info'
  title: string
  detail: string
  link: string
}

export interface HomeToday {
  date: string
  sales_count: number
  sales_cents: number
  last_week_weekday: string
  last_week_same_time_cents: number
  in_by_method: Record<MoneyMethod, number>
  expenses_cents: number
  put_on_account_cents: number
  expected_cash_cents: number
  count: { counted_cents: number; difference_cents: number; counted_by: string | null } | null
}

export interface HomeMonth {
  name: string
  sales_cents: number
  last_month_name: string
  last_month_same_time_cents: number
  best_seller_week: { stock_item_id: number; name: string; unit: string; quantity: number; total_cents: number } | null
  owed_cents: number
  owing_customers: number
  top_debtor: { id: number; name: string; stall: string; owed_cents: number } | null
}

export interface HomeSale {
  id: number
  number: string
  status: 'posted' | 'voided'
  date: string
  created_at: string
  total_cents: number
  customer: string | null
  seller: string | null
  items: string
  methods: PaymentMethod[]
}

export interface HomeWork {
  id: number
  number: string
  status: 'taken' | 'in_work'
  customer: string | null
  due_on: string
  overdue: boolean
  items: string
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
  returned_quantity: number
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
  returns?: SaleReturn[]
  approval?: { id: number; number: string } | null
  created_at: string | null
}

export type RefundMethod = 'cash' | 'send_money' | 'paybill' | 'account' | 'none'

export interface SaleReturn {
  id: number
  number: string
  refund_method: RefundMethod
  refund_label: string
  refund_cents: number
  reason: string
  lines: { sale_line_id: number; quantity: number }[]
  created_by: { id: number; name: string } | null
  created_at: string | null
}

export type MoneyMethod = 'cash' | 'send_money' | 'paybill'

export interface AccountPayment {
  id: number
  customer: { id: number; name: string; stall: string } | null
  /** "account" only on an order balance put on "to pay". */
  method: PaymentMethod
  method_label: string
  amount_cents: number
  mpesa_code: string | null
  note: string
  received_by: { id: number; name: string } | null
  voided: boolean
  voided_by: { id: number; name: string } | null
  void_reason: string
  created_at: string | null
  owed_after_cents?: number
}

export interface Expense {
  id: number
  category: string
  category_label: string
  amount_cents: number
  method: MoneyMethod
  method_label: string
  paid_to: string
  description: string
  recorded_by: { id: number; name: string } | null
  voided: boolean
  voided_by: { id: number; name: string } | null
  void_reason: string
  created_at: string | null
}

export interface CashCount {
  id: number
  date: string
  expected_cents: number
  counted_cents: number
  difference_cents: number
  kept_cents: number
  note: string
  counted_by: { id: number; name: string } | null
  created_at: string | null
}

export interface DayReturn {
  id: number
  number: string
  sale: { id: number; number: string }
  customer_name: string
  items: { description: string; quantity: number; unit: string }[]
  refund_method: RefundMethod
  refund_label: string
  refund_cents: number
  reason: string
  created_by: { id: number; name: string }
  created_at: string | null
}

export interface ApprovalLine {
  id: number
  stock_item_id: number
  name: string
  unit: string
  quantity_out: number
  quantity_returned: number
  quantity_sold: number
  outstanding: number
  unit_price_cents: number | null
}

export interface Approval {
  id: number
  number: string
  customer?: { id: number; name: string; stall: string }
  status: 'open' | 'closed'
  due_on: string
  overdue: boolean
  note: string
  pieces_out: number
  value_out_cents: number
  lines?: ApprovalLine[]
  sales?: { id: number; number: string; total_cents: number; status: string }[]
  created_by?: { id: number; name: string }
  created_at: string | null
  closed_at: string | null
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
  account_payments: AccountPayment[]
  order_payments: (AccountPayment & { order: { id: number; number: string } })[]
  returns: DayReturn[]
  expenses: Expense[]
  money: {
    opening_cash_cents: number
    sales_in: Record<MoneyMethod, number>
    account_payments_in: Record<MoneyMethod, number>
    order_payments_in: Record<MoneyMethod, number>
    refunds_out: Record<MoneyMethod, number>
    expenses_out: Record<MoneyMethod, number>
    net_by_method: Record<MoneyMethod, number>
    put_on_account_cents: number
    credited_to_accounts_cents: number
    expected_cash_cents: number
    count: CashCount | null
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

export type OrderStatus = 'taken' | 'in_work' | 'ready' | 'collected' | 'cancelled'

export interface OrderLine {
  id: number
  kind: 'fabric' | 'product' | 'work'
  roll_id: number | null
  length_cm: number | null
  stock_item_id: number | null
  quantity: number | null
  description: string
  total_cents: number
}

export interface Order {
  id: number
  number: string
  customer?: { id: number; name: string; stall: string; phone: string | null }
  status: OrderStatus
  status_label: string
  due_on: string
  overdue: boolean
  total_cents: number
  paid_cents: number
  balance_cents: number
  note: string
  lines?: OrderLine[]
  payments?: AccountPayment[]
  created_by?: { id: number; name: string }
  created_at: string | null
  started_at: string | null
  ready_at: string | null
  collected_at: string | null
  cancelled_at: string | null
  cancelled_by?: { id: number; name: string } | null
  cancel_reason: string
  refund_method: MoneyMethod | null
  refund_cents: number
}

export type NewOrderLine =
  | { kind: 'fabric'; roll_id: number; length_cm: number; total_cents: number; description?: string }
  | { kind: 'product'; stock_item_id: number; quantity: number; total_cents: number; description?: string }
  | { kind: 'work'; description: string; total_cents: number }

export interface ReportChartPoint {
  date: string
  sales_cents: number
  sales_count: number
  money_in_cents: number
  expenses_cents: number
}

/** GET /reports: how the shop did between two dates (inclusive, Nairobi days). */
export interface Report {
  from: string
  to: string
  days: number
  sales: {
    count: number
    total_cents: number
    average_cents: number
    returns_count: number
    returned_goods_cents: number
    refunded_cents: number
    net_cents: number
  }
  orders: {
    taken_count: number
    taken_cents: number
    collected_count: number
    collected_cents: number
    cancelled_count: number
    open_count: number
    open_balance_cents: number
  }
  money: {
    sales_in: Record<MoneyMethod, number>
    order_payments_in: Record<MoneyMethod, number>
    account_payments_in: Record<MoneyMethod, number>
    refunds_out: Record<MoneyMethod, number>
    expenses_out: Record<MoneyMethod, number>
    net_by_method: Record<MoneyMethod, number>
    put_on_account_cents: number
    credited_to_accounts_cents: number
    in_cents: number
    out_cents: number
    net_cents: number
  }
  chart: { bucket: 'day' | 'month'; points: ReportChartPoint[] }
  categories: { name: string; quantity: number | null; length_cm: number | null; total_cents: number }[]
  top_products: { stock_item_id: number; name: string; category: string | null; unit: string; quantity: number; total_cents: number }[]
  top_fabrics: { fabric_id: number; name: string; code: string; length_cm: number; total_cents: number }[]
  expenses: { total_cents: number; by_category: { category: string; count: number; total_cents: number }[] }
  staff: { id: number; name: string; count: number; total_cents: number }[]
  debtors: {
    count: number
    total_cents: number
    customers: { id: number; name: string; stall: string; phone: string | null; owed_cents: number }[]
  }
  /** Only for accounts allowed to see costs. */
  profit?: {
    revenue_cents: number
    cost_cents: number
    gross_cents: number
    expenses_cents: number
    after_expenses_cents: number
    lines_without_cost: number
  }
}
