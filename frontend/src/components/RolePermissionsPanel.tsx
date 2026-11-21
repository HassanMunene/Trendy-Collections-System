import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { PermissionInfo, RolePermissionRole } from '../api/types'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { ConfirmDialog, Modal } from './Dialog'
import { Drawer } from './Drawer'
import { useToast } from './toast-context'
import { Button, ErrorNotice, Field, Input, Loading, Pill, Textarea } from './ui'

const sort = (values: string[]) => [...values].sort()

/** Owner-only role table. Permissions are edited in a drawer per role. */
export function RolePermissionsPanel() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['role-permissions'], queryFn: api.rolePermissions })
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<RolePermissionRole | null>(null)
  const [creating, setCreating] = useState(false)

  if (isLoading) return <Loading label="Loading roles…" />
  if (error) return <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
  if (!data) return null

  const assignable = data.permissions.filter((permission) => permission.assignable)
  const term = q.trim().toLowerCase()
  const roles = data.roles.filter((role) => !term || `${role.label} ${role.description}`.toLowerCase().includes(term))

  const columns: DataTableColumn<RolePermissionRole>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (role) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{role.label}</p>
          <p className="line-clamp-1 max-w-90 text-xs text-ink-muted">{role.description || 'A custom role.'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      noWrap: true,
      render: (role) => <Pill tone="muted">{role.builtin ? 'Built-in' : 'Custom'}</Pill>,
    },
    {
      key: 'people',
      header: 'People',
      noWrap: true,
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      render: (role) => (role.members === 1 ? '1 person' : `${role.members} people`),
    },
    {
      key: 'access',
      header: 'Access',
      noWrap: true,
      render: (role) =>
        role.locked ? (
          <Pill tone="warn">Full access</Pill>
        ) : (
          <span className="text-sm text-ink-muted">
            {role.permissions.length} of {assignable.length} permissions
          </span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      noWrap: true,
      render: (role) => (
        <div data-table-stop-row-click>
          <Button
            variant="secondary"
            className="min-h-9 px-3 text-xs sm:text-sm"
            onClick={() => setEditing(role)}
            aria-label={`Manage permissions for ${role.label}`}
          >
            {role.locked ? 'View' : 'Permissions'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">
        Each role sets what its people may do. Choose a role to open its permissions drawer. Managing users and reading the audit log stay with
        owners, and the owner role always has everything.
      </p>

      <DataTable
        columns={columns}
        data={roles}
        rowKey="key"
        onRowClick={setEditing}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search roles…"
        description={`${data.roles.length} ${data.roles.length === 1 ? 'role' : 'roles'}`}
        toolbar={<Button onClick={() => setCreating(true)}>+ New role</Button>}
        emptyContent={
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="font-display text-xl text-plum">{data.roles.length ? 'No role matches' : 'No roles yet'}</p>
            <p className="max-w-md text-sm text-ink-muted">
              {data.roles.length ? 'Try another search.' : 'Add a role to describe a job in your shop.'}
            </p>
            {!data.roles.length && <Button className="mt-2" onClick={() => setCreating(true)}>+ New role</Button>}
          </div>
        }
      />

      {creating && <CreateRoleDialog permissions={assignable} onClose={() => setCreating(false)} />}

      {editing && (
        <RoleDrawer
          key={editing.key}
          role={editing}
          permissions={data.permissions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function RoleDrawer({
  role,
  permissions,
  onClose,
}: {
  role: RolePermissionRole
  permissions: PermissionInfo[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<string[]>(role.permissions)
  const [label, setLabel] = useState(role.label)
  const [description, setDescription] = useState(role.description)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const assignable = permissions.filter((permission) => permission.assignable)
  const ownerOnly = permissions.filter((permission) => !permission.assignable)
  const permissionsDirty = JSON.stringify(sort(selected)) !== JSON.stringify(sort(role.permissions))
  const detailsDirty = !role.builtin && (label.trim() !== role.label || description.trim() !== role.description)

  function toggle(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((p) => p !== key) : [...current, key]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (role.locked) {
      onClose()
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      if (detailsDirty) await api.updateRole(role.key, { label, description })
      if (permissionsDirty) await api.updateRolePermissions(role.key, selected)
      toast.success(
        <>
          <strong>{label}</strong> saved. People in this role see the change within seconds.
        </>,
      )
      await qc.invalidateQueries({ queryKey: ['role-permissions'] })
      await qc.invalidateQueries({ queryKey: ['roles'] })
      onClose()
    } catch (err) {
      const p = toProblem(err)
      setProblem(p)
      toast.error(p.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setDeleteBusy(true)
    try {
      await api.deleteRole(role.key)
      toast.success(<><strong>{role.label}</strong> was deleted.</>)
      await qc.invalidateQueries({ queryKey: ['role-permissions'] })
      await qc.invalidateQueries({ queryKey: ['roles'] })
      setDeleting(false)
      onClose()
    } catch (err) {
      toast.error(toProblem(err).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  const f = problem?.fields ?? {}

  return (
    <>
      <Drawer
        title={role.label}
        description={role.locked ? 'The owner role always has full access.' : 'Tick what people in this role may do.'}
        size="md"
        onClose={busy ? () => {} : onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {role.locked ? 'Close' : 'Cancel'}
            </Button>
            {!role.locked && (
              <Button type="submit" form="role-permissions-form" busy={busy} disabled={!permissionsDirty && !detailsDirty}>
                Save changes
              </Button>
            )}
          </>
        }
      >
        <form id="role-permissions-form" onSubmit={submit} className="grid gap-5" noValidate>
          {!role.builtin && !role.locked && (
            <div className="grid gap-4">
              <Field label="Role name" error={f.label}>
                {(a) => <Input {...a} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />}
              </Field>
              <Field label="What it is for" error={f.description} hint="Optional. Only you see this on the roles table.">
                {(a) => <Textarea {...a} rows={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
            </div>
          )}

          {role.locked ? (
            <div>
              <p className="mb-3 text-sm text-ink-muted">Owners cannot be limited. Everything is always allowed:</p>
              <ul className="grid gap-2">
                {permissions.map((permission) => (
                  <li key={permission.key} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden className="mt-0.5 grid size-4 flex-none place-items-center rounded border border-rose bg-rose text-[10px] font-bold text-white">
                      ✓
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{permission.label}</span>
                      <span className="block text-xs text-ink-muted">{permission.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <fieldset className="grid gap-2.5">
              <legend className="mb-1 text-sm font-semibold text-ink">Permissions</legend>
              {assignable.map((permission) => (
                <label key={permission.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-blush-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(permission.key)}
                    onChange={() => toggle(permission.key)}
                    className="mt-0.5 size-4 flex-none accent-rose"
                  />
                  <span>
                    <span className="block font-medium text-ink">{permission.label}</span>
                    <span className="block text-xs text-ink-muted">{permission.description}</span>
                  </span>
                </label>
              ))}
              <p className="mt-1 text-xs text-ink-muted">
                Owners only: {ownerOnly.map((permission) => permission.label).join(', ')}.
              </p>
            </fieldset>
          )}

          {problem && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
        </form>

        {!role.builtin && !role.locked && (
          <div className="mt-6 rounded-xl border border-danger/25 bg-danger-soft/40 p-4">
            <p className="text-sm font-semibold text-danger">Delete this role</p>
            <p className="mt-1 text-xs text-ink-muted">
              {role.members > 0
                ? `Move the ${role.members === 1 ? 'person' : `${role.members} people`} in this role to another role first, then delete it.`
                : 'Nobody is in this role. Deleting it removes the role and its permissions for good.'}
            </p>
            <Button
              variant="ghost"
              className="mt-2 min-h-9 px-3 text-sm text-danger hover:bg-danger-soft"
              disabled={role.members > 0}
              onClick={() => setDeleting(true)}
            >
              Delete role
            </Button>
          </div>
        )}
      </Drawer>

      {deleting && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Delete ${role.label}?`}
          description="This removes the role and its permissions for good. It cannot be undone."
          confirmLabel="Delete role"
          busy={deleteBusy}
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}

function CreateRoleDialog({ permissions, onClose }: { permissions: PermissionInfo[]; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      await api.createRole({ label, description, permissions: selected })
      toast.success(
        <>
          <strong>{label}</strong> was created. Open it in the table to change its permissions, or give it to someone on the Users tab.
        </>,
      )
      await qc.invalidateQueries({ queryKey: ['role-permissions'] })
      await qc.invalidateQueries({ queryKey: ['roles'] })
      onClose()
    } catch (err) {
      const p = toProblem(err)
      setProblem(p)
      toast.error(p.message)
    } finally {
      setBusy(false)
    }
  }

  const f = problem?.fields ?? {}
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="New role"
      description="Name the job, then tick what it may do. You can change all of this later in its drawer."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="create-role-form" busy={busy} disabled={!label.trim()}>
            Create role
          </Button>
        </>
      }
    >
      <form id="create-role-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Role name" error={f.label} hint="For example: Stock keeper, Floor supervisor, Delivery.">
          {(a) => <Input {...a} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoFocus />}
        </Field>
        <Field label="What it is for" error={f.description} hint="Optional, shown on the roles table.">
          {(a) => <Textarea {...a} rows={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink">What this role may do</legend>
          {permissions.map((permission) => (
            <label key={permission.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-blush-50">
              <input
                type="checkbox"
                checked={selected.includes(permission.key)}
                onChange={() =>
                  setSelected((current) => (current.includes(permission.key) ? current.filter((p) => p !== permission.key) : [...current, permission.key]))
                }
                className="mt-0.5 size-4 flex-none accent-rose"
              />
              <span>
                <span className="block font-medium text-ink">{permission.label}</span>
                <span className="block text-xs text-ink-muted">{permission.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {problem && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
      </form>
    </Modal>
  )
}
