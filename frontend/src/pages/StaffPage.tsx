import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Role, StaffUser } from '../api/types'
import { useCurrentUser } from '../auth/useMe'
import { Button, Card, ErrorNotice, Field, Input, Loading, Notice, PageHeader, Pill, Select } from '../components/ui'
import { formatDateTime, formatPhone } from '../lib/units'

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: 'owner', label: 'Owner', help: 'Everything, including staff accounts' },
  { value: 'manager', label: 'Manager', help: 'Receive stock, correct counts, edit fabrics, see costs' },
  { value: 'cashier', label: 'Cashier', help: 'Look up stock; sales and payments come next' },
  { value: 'cutter', label: 'Cutter', help: 'Look up stock; cutting jobs come next' },
  { value: 'tailor', label: 'Tailor', help: 'Look up stock; sewing jobs come next' },
]

export function StaffPage() {
  const me = useCurrentUser()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['staff'], queryFn: api.staff })
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null)
  const [message, setMessage] = useState<React.ReactNode>(null)
  const [actionError, setActionError] = useState<ApiProblem | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] })

  async function resetPassword(u: StaffUser) {
    if (!window.confirm(`Give ${u.name} a new temporary password? They will be signed out.`)) return
    setActionError(null)
    try {
      const { temporary_password } = await api.resetStaffPassword(u.id)
      setMessage(
        <>
          Temporary password for <strong>{u.name}</strong>: <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-bold">{temporary_password}</code>
          <br />
          Tell them in person. It is shown only once; they must change it when they sign in.
        </>,
      )
      refresh()
    } catch (e) {
      setActionError(toProblem(e))
    }
  }

  async function toggleActive(u: StaffUser) {
    if (u.active && !window.confirm(`Switch off ${u.name}'s account? They will be signed out and cannot sign in. Their history stays.`)) return
    setActionError(null)
    try {
      await api.setStaffActive(u.id, !u.active)
      setMessage(`${u.name} is now ${u.active ? 'switched off' : 'active again'}.`)
      refresh()
    } catch (e) {
      setActionError(toProblem(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Everyone gets their own account. Never share a login: the system records who did what."
        action={editing === null && <Button onClick={() => { setEditing('new'); setMessage(null) }}>+ Add staff member</Button>}
      />
      {message && (
        <div className="mb-4">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <ErrorNotice problem={actionError} />
        </div>
      )}
      {editing !== null && (
        <div className="mb-4">
          <StaffForm
            existing={editing === 'new' ? null : editing}
            onDone={(msg) => {
              setEditing(null)
              setMessage(msg)
              refresh()
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {isLoading && <Loading />}
      {error && <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />}
      <ul className="grid gap-2.5 lg:grid-cols-2">
        {data?.map((u) => {
          const locked = u.is_superadmin && !me.is_superadmin
          return (
            <li key={u.id} className={`rounded-xl border border-line-soft bg-white p-4 ${u.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {u.name} {u.id === me.id && <span className="text-sm font-normal text-ink-muted">(you)</span>}
                  </p>
                  <p className="text-sm text-ink-muted">
                    @{u.username}
                    {u.phone && ` · ${formatPhone(u.phone)}`}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">Last signed in: {u.last_login_at ? formatDateTime(u.last_login_at) : 'never'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill>{u.is_superadmin ? 'Superadmin' : ROLES.find((r) => r.value === u.role)?.label}</Pill>
                  {!u.active && <Pill tone="muted">Switched off</Pill>}
                  {u.active && u.must_change_password && <Pill tone="warn">Temporary password</Pill>}
                </div>
              </div>
              {!locked && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
                  <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => { setEditing(u); setMessage(null) }}>
                    Edit
                  </Button>
                  {u.id !== me.id && (
                    <>
                      <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => resetPassword(u)}>
                        Reset password
                      </Button>
                      <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => toggleActive(u)}>
                        {u.active ? 'Switch off' : 'Switch on'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function StaffForm({ existing, onDone, onCancel }: { existing: StaffUser | null; onDone: (msg: React.ReactNode) => void; onCancel: () => void }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [phone, setPhone] = useState(formatPhone(existing?.phone))
  const [role, setRole] = useState<Role>(existing?.role ?? 'cashier')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      if (existing) {
        await api.updateStaff(existing.id, { name, username, phone, role })
        onDone(`${name}'s account was updated.`)
      } else {
        await api.createStaff({ name, username, phone, role, password })
        onDone(
          <>
            Account created for <strong>{name}</strong>. They sign in as <strong>{username}</strong> with the password you chose, then set their own.
          </>,
        )
      }
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  const f = problem?.fields ?? {}
  return (
    <Card title={existing ? `Edit ${existing.name}` : 'New staff member'}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" error={f.name}>
          {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Username" error={f.username} hint="What they type to sign in, e.g. amina">
          {(a) => <Input {...a} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" />}
        </Field>
        <Field label="Phone" error={f.phone} hint="Optional. They can also sign in with it.">
          {(a) => <Input {...a} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />}
        </Field>
        <Field label="Role" error={f.role} hint={ROLES.find((r) => r.value === role)?.help}>
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {!existing && (
          <Field label="First password" error={f.password} hint="At least 8 characters. They will be asked to change it.">
            {(a) => <Input {...a} type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
          </Field>
        )}
        {problem && Object.keys(problem.fields).length === 0 && (
          <div className="sm:col-span-2">
            <ErrorNotice problem={problem} />
          </div>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" busy={busy}>
            {existing ? 'Save' : 'Create account'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
