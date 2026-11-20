import { http } from './client'
import type {
  Adjustment,
  Dashboard,
  Fabric,
  Lookups,
  LookupType,
  Me,
  Movement,
  Paginated,
  Roll,
  StaffUser,
  Term,
} from './types'

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data)

export const api = {
  // Auth
  login: (login: string, password: string) => unwrap<Me>(http.post('/login', { login, password })),
  logout: () => http.post('/logout'),
  me: () => unwrap<Me>(http.get('/me')),
  changePassword: (body: { current_password: string; password: string; password_confirmation: string }) =>
    unwrap<Me>(http.post('/me/password', body)),

  dashboard: () => unwrap<Dashboard>(http.get('/dashboard')),

  // Staff
  staff: () => unwrap<StaffUser[]>(http.get('/staff')),
  createStaff: (body: { name: string; username: string; phone: string; role: string; password: string }) =>
    unwrap<StaffUser>(http.post('/staff', body)),
  updateStaff: (id: number, body: { name: string; username: string; phone: string; role: string }) =>
    unwrap<StaffUser>(http.patch(`/staff/${id}`, body)),
  resetStaffPassword: (id: number) =>
    unwrap<{ temporary_password: string }>(http.post(`/staff/${id}/reset-password`)),
  setStaffActive: (id: number, active: boolean) => unwrap<StaffUser>(http.post(`/staff/${id}/active`, { active })),

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
  adjustments: (rollId: number) => unwrap<Adjustment[]>(http.get(`/rolls/${rollId}/adjustments`)),
  adjustRoll: (rollId: number, body: { counted_cm: number; reason: string }) =>
    unwrap<Adjustment>(http.post(`/rolls/${rollId}/adjustments`, body)),
}
