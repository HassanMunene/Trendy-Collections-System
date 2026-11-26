import { http } from './client'
import type {
    AccountPayment,
    Adjustment,
    Approval,
    CashCount,
    Expense,
    MoneyMethod,
    NewOrderLine,
    Order,
    RefundMethod,
    Report,
    AuditEvent,
    Customer,
    Dashboard,
    DayBook,
    PriceHint,
    ProductCategory,
    Sale,
    SaleBody,
    SewingBatch,
    Fabric,
    Lookups,
    LookupType,
    Me,
    Movement,
    Paginated,
    RoleOption,
    RolePermissionRole,
    RolePermissionsData,
    Roll,
    StaffUser,
    StockItem,
    Supplier,
    Term,
} from './types'

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data)

interface SupplierBody {
    name: string
    phone: string
    building?: string
    stall?: string
    notes?: string
}

export const api = {
    // Auth
    login: (login: string, password: string) => unwrap<Me>(http.post('/login', { login, password })),
    logout: () => http.post('/logout'),
    me: () => unwrap<Me>(http.get('/me')),
    changePassword: (body: { current_password: string; password: string; password_confirmation: string }) =>
        unwrap<Me>(http.post('/me/password', body)),
    updateMe: (body: { name: string; username: string; phone: string }) =>
        unwrap<Me>(http.patch('/me', body)),
    uploadAvatar: (file: File) => {
        const body = new FormData()
        body.append('avatar', file)
        return unwrap<Me>(http.post('/me/avatar', body))
    },
    removeAvatar: () => unwrap<Me>(http.delete('/me/avatar')),

    dashboard: () => unwrap<Dashboard>(http.get('/dashboard')),

    // Staff
    staff: () => unwrap<StaffUser[]>(http.get('/staff')),
    createStaff: (body: { name: string; username: string; phone: string; role: string; password: string }) =>
        unwrap<StaffUser>(http.post('/staff', body)),
    updateStaff: (id: number, body: { name: string; username: string; phone: string; role: string }) =>
        unwrap<StaffUser>(http.patch(`/staff/${id}`, body)),
    resetStaffPassword: (id: number, body: { password: string; password_confirmation: string }) =>
        unwrap<StaffUser>(http.post(`/staff/${id}/reset-password`, body)),
    setStaffActive: (id: number, active: boolean) => unwrap<StaffUser>(http.post(`/staff/${id}/active`, { active })),

    // Live permission check (every signed-in account)
    permissionFingerprint: () => unwrap<{ fingerprint: string }>(http.get('/session/permissions')),

    // Roles & permissions (owner only)
    roles: () => unwrap<RoleOption[]>(http.get('/roles')),
    createRole: (body: { label: string; description: string; permissions: string[] }) =>
        unwrap<RolePermissionRole>(http.post('/roles', body)),
    updateRole: (roleKey: string, body: { label: string; description: string }) =>
        unwrap<RolePermissionRole>(http.patch(`/roles/${roleKey}`, body)),
    deleteRole: (roleKey: string) => http.delete(`/roles/${roleKey}`),
    rolePermissions: () => unwrap<RolePermissionsData>(http.get('/role-permissions')),
    updateRolePermissions: (roleKey: string, permissions: string[]) =>
        unwrap<RolePermissionRole>(http.put(`/role-permissions/${roleKey}`, { permissions })),

    // Audit trail (owner only)
    auditEvents: (params: Record<string, string | number | undefined> = {}) =>
        http.get<Paginated<AuditEvent>>('/audit-events', { params }).then((r) => r.data),

    // Suppliers
    suppliers: () => unwrap<Supplier[]>(http.get('/suppliers')),
    createSupplier: (body: SupplierBody) => unwrap<Supplier>(http.post('/suppliers', body)),
    updateSupplier: (id: number, body: SupplierBody) => unwrap<Supplier>(http.patch(`/suppliers/${id}`, body)),

    // Catalogue
    lookups: () => unwrap<Lookups>(http.get('/lookups')),
    addLookup: (type: LookupType, name: string) => unwrap<Term>(http.post(`/lookups/${type}`, { name })),
    fabrics: (params: { q?: string; category_id?: number; include_inactive?: boolean } = {}) =>
        unwrap<Fabric[]>(http.get('/fabrics', { params: { ...params, include_inactive: params.include_inactive ? 1 : undefined } })),
    fabric: (id: number) => unwrap<Fabric>(http.get(`/fabrics/${id}`)),
    createFabric: (body: Record<string, unknown>) => unwrap<Fabric>(http.post('/fabrics', body)),
    updateFabric: (id: number, body: Record<string, unknown>) => unwrap<Fabric>(http.patch(`/fabrics/${id}`, body)),

    // Rolls
    rolls: (params: Record<string, string | number | undefined>) =>
        http.get<Paginated<Roll>>('/rolls', { params }).then((r) => r.data),
    roll: (id: number) =>
        http.get<{ data: Roll; movements: Movement[] }>(`/rolls/${id}`).then((r) => r.data),
    receiveRoll: (body: Record<string, unknown>) => unwrap<Roll>(http.post('/rolls', body)),
    adjustRoll: (rollId: number, body: { counted_cm: number; reason: string }) =>
        unwrap<Adjustment>(http.post(`/rolls/${rollId}/adjustments`, body)),

    // Stock that is not a fabric roll
    stockItems: (params: Record<string, string | number | undefined> = {}) =>
        http.get<Paginated<StockItem>>('/stock-items', { params }).then((r) => r.data),
    receiveStockItem: (body: Record<string, unknown>) => unwrap<StockItem>(http.post('/stock-items', body)),

    restockItem: (id: number, body: { quantity: number; note?: string }) => unwrap<StockItem>(http.post(`/stock-items/${id}/receipts`, body)),
    countItem: (id: number, body: { counted: number; reason: string }) => unwrap<StockItem>(http.post(`/stock-items/${id}/adjustments`, body)),

    // What the shop sells
    productCategories: () => unwrap<ProductCategory[]>(http.get('/product-categories')),
    products: (params: { q?: string; category_id?: number; include_inactive?: boolean } = {}) =>
        unwrap<StockItem[]>(http.get('/products', { params: { ...params, include_inactive: params.include_inactive ? 1 : undefined } })),
    createProduct: (body: Record<string, unknown>) => unwrap<StockItem>(http.post('/products', body)),
    updateProduct: (id: number, body: Record<string, unknown>) => unwrap<StockItem>(http.patch(`/products/${id}`, body)),

    // Customers and counter sales
    customers: (params: { q?: string; owing?: boolean } = {}) =>
        unwrap<Customer[]>(http.get('/customers', { params: { q: params.q || undefined, owing: params.owing ? 1 : undefined } })),
    customer: (id: number) => http.get<{ data: Customer; sales: Sale[] }>(`/customers/${id}`).then((r) => r.data),
    createCustomer: (body: { name: string; phone?: string; stall?: string; notes?: string }) => unwrap<Customer>(http.post('/customers', body)),
    updateCustomer: (id: number, body: { name: string; phone?: string; stall?: string; notes?: string; active?: boolean }) =>
        unwrap<Customer>(http.patch(`/customers/${id}`, body)),
    recordSale: (body: SaleBody) => unwrap<Sale>(http.post('/sales', body)),
    sale: (id: number) => unwrap<Sale>(http.get(`/sales/${id}`)),
    voidSale: (id: number, reason: string) => unwrap<Sale>(http.post(`/sales/${id}/void`, { reason })),
    priceHint: (stockItemId: number, customerId?: number | null) =>
        unwrap<PriceHint>(http.get('/sales/price-hint', { params: { stock_item_id: stockItemId, customer_id: customerId ?? undefined } })),
    dayBook: (date?: string) => unwrap<DayBook>(http.get('/day-book', { params: { date } })),
    report: (from?: string, to?: string) => unwrap<Report>(http.get('/reports', { params: { from, to } })),

    // Sewing for the shelf
    sewingBatches: (params: { sewn_by?: number; from?: string } = {}) => unwrap<SewingBatch[]>(http.get('/sewing-batches', { params })),
    tailors: () => unwrap<{ id: number; name: string }[]>(http.get('/sewing-batches/tailors')),
    recordSewing: (body: { sewn_by?: number; note?: string; inputs: { roll_id: number; used_cm: number }[]; outputs: { stock_item_id: number; quantity: number }[] }) =>
        unwrap<SewingBatch>(http.post('/sewing-batches', body)),

    // Trade accounts
    customerDetail: (id: number) =>
        http.get<{ data: Customer; sales: Sale[]; account_payments: AccountPayment[]; orders: Order[] }>(`/customers/${id}`).then((r) => r.data),
    payAccount: (customerId: number, body: { method: MoneyMethod; amount_cents: number; mpesa_code?: string | null; note?: string }) =>
        unwrap<AccountPayment>(http.post(`/customers/${customerId}/payments`, body)),
    voidAccountPayment: (id: number, reason: string) => unwrap<AccountPayment>(http.post(`/account-payments/${id}/void`, { reason })),
    returnItems: (saleId: number, body: { lines: { sale_line_id: number; quantity: number }[]; refund_method: RefundMethod; refund_cents: number; reason: string }) =>
        unwrap<Sale>(http.post(`/sales/${saleId}/returns`, body)),
    recordExpense: (body: { category: string; amount_cents: number; method: MoneyMethod; paid_to?: string; description?: string }) =>
        unwrap<Expense>(http.post('/expenses', body)),
    voidExpense: (id: number, reason: string) => unwrap<Expense>(http.post(`/expenses/${id}/void`, { reason })),
    countCash: (body: { date: string; counted_cents: number; kept_cents: number; note?: string }) => unwrap<CashCount>(http.post('/cash-counts', body)),
    approvals: (status: 'open' | 'closed' | 'all' = 'open') => unwrap<Approval[]>(http.get('/approvals', { params: { status } })),
    approval: (id: number) => unwrap<Approval>(http.get(`/approvals/${id}`)),
    issueApproval: (body: { customer_id: number; note?: string; lines: { stock_item_id: number; quantity: number; unit_price_cents?: number | null }[] }) =>
        unwrap<Approval>(http.post('/approvals', body)),
    settleApproval: (
        id: number,
        body: {
            note?: string
            lines: { approval_line_id: number; returned: number; sold: number; total_cents?: number | null }[]
            payments: { method: string; amount_cents: number; mpesa_code?: string | null }[]
        },
    ) => http.post<{ data: Approval; sale: Sale | null }>(`/approvals/${id}/settle`, body).then((r) => r.data),

    // Custom orders
    orders: (params: { status?: 'active' | 'ready' | 'done' | 'all'; q?: string; customer_id?: number } = {}) =>
        unwrap<Order[]>(http.get('/orders', { params: { ...params, q: params.q || undefined } })),
    order: (id: number) => unwrap<Order>(http.get(`/orders/${id}`)),
    createOrder: (body: {
        customer_id: number
        due_on: string
        note?: string
        lines: NewOrderLine[]
        deposit?: { method: MoneyMethod; amount_cents: number; mpesa_code?: string | null } | null
    }) => unwrap<Order>(http.post('/orders', body)),
    payOrder: (id: number, body: { method: MoneyMethod; amount_cents: number; mpesa_code?: string | null }) => unwrap<Order>(http.post(`/orders/${id}/payments`, body)),
    startOrder: (id: number) => unwrap<Order>(http.post(`/orders/${id}/start`)),
    readyOrder: (id: number) => unwrap<Order>(http.post(`/orders/${id}/ready`)),
    collectOrder: (id: number, payments: { method: string; amount_cents: number; mpesa_code?: string | null }[]) =>
        unwrap<Order>(http.post(`/orders/${id}/collect`, { payments })),
    cancelOrder: (id: number, body: { reason: string; refund_cents: number; refund_method?: MoneyMethod | null }) =>
        unwrap<Order>(http.post(`/orders/${id}/cancel`, body)),
}
