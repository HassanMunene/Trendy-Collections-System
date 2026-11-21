import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { StaffUser } from '../api/types'
import { useCurrentUser } from '../auth/useMe'
import { Avatar } from '../components/Avatar'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { ConfirmDialog, Modal } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { RolePermissionsPanel } from '../components/RolePermissionsPanel'
import { TeamIcon } from '../components/icons'
import { useToast } from '../components/toast-context'
import { Button, ErrorNotice, Field, Input, Notice, PageHeader, PasswordInput, Pill, Select } from '../components/ui'
import { cx } from '../lib/cx'
import { formatDateTime, formatPhone } from '../lib/units'

const PAGE_SIZE = 10

const roleLabel = (u: StaffUser) => (u.is_superadmin ? 'Superadmin' : u.role_label || u.role)

type SwitchRequest = { user: StaffUser; next: boolean }

export function StaffPage() {
  const me = useCurrentUser()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['staff'], queryFn: api.staff })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null)
  const [resetting, setResetting] = useState<StaffUser | null>(null)
  const [switching, setSwitching] = useState<SwitchRequest | null>(null)
  const [switchBusy, setSwitchBusy] = useState(false)
  const [actionError, setActionError] = useState<ApiProblem | null>(null)
  const [tab, setTab] = useState<'people' | 'roles'>('people')

  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] })

  const term = q.trim().toLowerCase()
  const staff = data ?? []
  const shown = staff.filter((u) => !term || `${u.name} ${u.username} ${u.phone ?? ''}`.toLowerCase().includes(term))
  const pageCount = Math.max(1, Math.ceil(shown.length / itemsPerPage))
  const safePage = Math.min(page, pageCount)
  const pageRows = shown.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)
  const activeCount = staff.filter((u) => u.active).length

  async function confirmSwitch() {
    if (!switching) return
    const { user, next } = switching
    setSwitchBusy(true)
    setActionError(null)
    try {
      await api.setStaffActive(user.id, next)
      toast.success(next ? `${user.name} can sign in again.` : `${user.name} is switched off and signed out everywhere.`)
      setSwitching(null)
      refresh()
    } catch (e) {
      const problem = toProblem(e)
      setActionError(problem)
      toast.error(problem.message)
    } finally {
      setSwitchBusy(false)
    }
  }

  const columns: DataTableColumn<StaffUser>[] = [
    {
      key: 'person',
      header: 'Staff member',
      render: (u) => {
        const isSelf = u.id === me.id
        return (
          <div className="flex items-center gap-3">
            <Avatar name={u.name} url={u.avatar_url} size="sm" eager />
            <div className="min-w-0">
              <p className={cx('flex flex-wrap items-center gap-1.5 font-semibold', isSelf ? 'text-plum' : 'text-ink')}>
                <span className="max-w-40 truncate sm:max-w-52">{u.name}</span>
                {isSelf && <Pill tone="success">You</Pill>}
              </p>
              <p className="truncate text-xs text-ink-muted">@{u.username}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'role',
      header: 'Role',
      noWrap: true,
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      render: (u) => <Pill tone={u.is_superadmin ? 'warn' : 'default'}>{roleLabel(u)}</Pill>,
    },
    {
      key: 'phone',
      header: 'Phone',
      noWrap: true,
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      render: (u) => (u.phone ? formatPhone(u.phone) : '—'),
    },
    {
      key: 'last_login',
      header: 'Last signed in',
      noWrap: true,
      headerClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden lg:table-cell text-ink-muted',
      render: (u) => (u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'),
    },
    {
      key: 'status',
      header: 'Status',
      noWrap: true,
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          <Pill tone={u.active ? 'success' : 'muted'}>{u.active ? 'Active' : 'Switched off'}</Pill>
          {u.active && u.must_change_password && <Pill tone="warn">Temp password</Pill>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      noWrap: true,
      render: (u) => {
        const isSelf = u.id === me.id
        const resetReason = isSelf ? 'Change your own password from My account.' : null
        const switchReason = u.is_superadmin
          ? 'The superadmin account cannot be switched off.'
          : isSelf
            ? 'You cannot switch off your own account.'
            : null
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5" data-table-stop-row-click>
            <Button
              variant="secondary"
              className="min-h-9 px-2.5 text-xs sm:text-sm"
              onClick={() => setEditing(u)}
              aria-label={`Edit ${u.name}`}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              className="min-h-9 px-2.5 text-xs sm:text-sm"
              onClick={() => setResetting(u)}
              disabled={Boolean(resetReason)}
              title={resetReason ?? `Set a new password for ${u.name}`}
              aria-label={`Reset password for ${u.name}`}
            >
              Reset password
            </Button>
            <Button
              variant="ghost"
              className={cx('min-h-9 px-2.5 text-xs sm:text-sm', u.active && !switchReason && 'text-danger hover:bg-danger-soft')}
              onClick={() => setSwitching({ user: u, next: !u.active })}
              disabled={Boolean(switchReason)}
              title={switchReason ?? (u.active ? `Switch off ${u.name}` : `Switch on ${u.name}`)}
              aria-label={u.active ? `Switch off ${u.name}` : `Switch on ${u.name}`}
            >
              {u.active ? 'Switch off' : 'Switch on'}
            </Button>
          </div>
        )
      },
    },
  ]

  const tabs = [
    { id: 'people' as const, label: 'Users' },
    { id: 'roles' as const, label: 'Roles & permissions' },
  ]

  return (
    <>
      <PageHeader
        title="User management"
        subtitle="Accounts, roles and what each role is allowed to do."
        action={tab === 'people' ? <Button onClick={() => setEditing('new')}>+ Add staff member</Button> : undefined}
      />

      <div role="tablist" aria-label="User management" className="mb-4 inline-flex rounded-xl border border-line-soft bg-white p-1 shadow-card">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cx(
              'min-h-9 rounded-lg px-3 text-sm font-semibold transition',
              tab === item.id ? 'bg-blush-200 text-plum' : 'text-ink-muted hover:bg-blush-50 hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'roles' ? (
        <RolePermissionsPanel />
      ) : (
        <>
      {actionError && (
        <div className="mb-4">
          <ErrorNotice problem={actionError} />
        </div>
      )}

      {error ? (
        <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={pageRows}
          isLoading={isLoading}
          rowKey="id"
          currentPage={safePage}
          itemsPerPage={itemsPerPage}
          totalItems={shown.length}
          onPageChange={setPage}
          onItemsPerPageChange={(size) => {
            setItemsPerPage(size)
            setPage(1)
          }}
          onRowClick={(u) => setEditing(u)}
          rowClassName={(u) => cx(u.active ? '' : 'text-ink-muted', u.id === me.id && 'bg-blush-50/70')}
          searchValue={q}
          onSearchChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          searchPlaceholder="Search name, username or phone…"
          description={`${staff.length} ${staff.length === 1 ? 'account' : 'accounts'} · ${activeCount} active`}
          emptyContent={
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-blush-200 text-rose">
                <TeamIcon />
              </span>
              <p className="font-display text-xl text-plum">{staff.length ? 'No staff member matches' : 'No staff accounts yet'}</p>
              <p className="max-w-md text-sm text-ink-muted">
                {staff.length ? 'Try another search.' : 'Add the first person who will use the shop system.'}
              </p>
              {!staff.length && (
                <Button className="mt-2" onClick={() => setEditing('new')}>
                  + Add staff member
                </Button>
              )}
            </div>
          }
        />
      )}

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? 'Add staff member' : 'Edit staff member'}
          description={editing === 'new' ? 'They sign in with the username and first password you set here.' : `Changing details for ${editing.name}.`}
          size="md"
          onClose={() => setEditing(null)}
        >
          <StaffForm
            key={editing === 'new' ? 'new' : editing.id}
            existing={editing === 'new' ? null : editing}
            onSaved={(message) => {
              setEditing(null)
              toast.success(message)
              refresh()
            }}
            onCancel={() => setEditing(null)}
          />
        </Drawer>
      )}

      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}

      {switching && (
        <ConfirmDialog
          open
          onClose={() => setSwitching(null)}
          onConfirm={confirmSwitch}
          busy={switchBusy}
          tone={switching.next ? 'default' : 'danger'}
          title={switching.next ? `Switch ${switching.user.name} back on?` : `Switch off ${switching.user.name}?`}
          description={
            switching.next
              ? 'They will be able to sign in again with their current password.'
              : 'They will be signed out on every device and cannot sign in until you switch them back on. Their history and stock records stay.'
          }
          confirmLabel={switching.next ? 'Switch on' : 'Switch off'}
        />
      )}
        </>
      )}
    </>
  )
}

function StaffForm({ existing, onSaved, onCancel }: { existing: StaffUser | null; onSaved: (message: ReactNode) => void; onCancel: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(existing?.name ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [phone, setPhone] = useState(formatPhone(existing?.phone))
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.roles })
  const [role, setRole] = useState(existing?.role ?? 'cashier')
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
        onSaved(
          <>
            <strong>{name}</strong>&apos;s account was updated.
          </>,
        )
      } else {
        await api.createStaff({ name, username, phone, role, password })
        onSaved(
          <>
            Account created for <strong>{name}</strong>. They sign in as <strong>{username}</strong> with the password you chose, then set their own.
          </>,
        )
      }
    } catch (err) {
      const p = toProblem(err)
      setProblem(p)
      if (Object.keys(p.fields).length === 0) toast.error(p.message)
    } finally {
      setBusy(false)
    }
  }

  const f = problem?.fields ?? {}
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Full name" error={f.name} className="sm:col-span-2">
        {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
      </Field>
      <Field label="Username" error={f.username} hint="What they type to sign in, e.g. amina">
        {(a) => <Input {...a} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" />}
      </Field>
      <Field label="Phone" error={f.phone} hint="Optional. They can also sign in with it.">
        {(a) => <Input {...a} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />}
      </Field>
      <Field label="Role" error={f.role} hint="What this role may do is set on the Roles & permissions tab." className="sm:col-span-2">
        {(a) => (
          <Select {...a} value={role} onChange={(e) => setRole(e.target.value)} disabled={roles.isLoading}>
            {(roles.data ?? []).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
            {role && !(roles.data ?? []).some((option) => option.key === role) && (
              <option value={role}>{existing?.role_label ?? role}</option>
            )}
          </Select>
        )}
      </Field>
      {!existing && (
        <Field label="First password" error={f.password} hint="At least 8 characters. They will be asked to change it when they sign in." className="sm:col-span-2">
          {(a) => <PasswordInput {...a} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
      )}
      {existing && existing.must_change_password && (
        <div className="sm:col-span-2">
          <Notice tone="warn">
            {existing.name} is still using a temporary password. Use <strong>Reset password</strong> if they have forgotten it.
          </Notice>
        </div>
      )}
      {problem && Object.keys(problem.fields).length === 0 && (
        <div className="sm:col-span-2">
          <ErrorNotice problem={problem} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4 sm:col-span-2">
        <Button type="submit" busy={busy}>
          {existing ? 'Save changes' : 'Create account'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setProblem({ status: 422, message: 'The two passwords do not match.', fields: { password_confirmation: 'The two passwords do not match.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.resetStaffPassword(user.id, { password, password_confirmation: confirm })
      toast.success(
        <>
          New password set for <strong>{user.name}</strong>. They must change it the next time they sign in.
        </>,
      )
      qc.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    } catch (err) {
      const p = toProblem(err)
      setProblem(p)
      toast.error(p.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`New password for ${user.name}`}
      description={
        <>
          They are signed out on every device. Tell them the password in person; they will be asked to choose their own when they sign in.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" busy={busy} disabled={!password || !confirm}>
            Set password
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="New password" error={problem?.fields.password} hint="At least 8 characters.">
          {(a) => <PasswordInput {...a} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />}
        </Field>
        <Field label="Type the new password again" error={problem?.fields.password_confirmation}>
          {(a) => <PasswordInput {...a} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
        </Field>
        {password && confirm && password !== confirm && <p className="-mt-1 text-sm font-medium text-danger">The two passwords do not match.</p>}
        {problem && problem.message && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
      </form>
    </Modal>
  )
}
