import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan, useCurrentUser, useSetMe } from '../auth/useMe'
import { Avatar } from '../components/Avatar'
import { CameraIcon, LogoutIcon, TrashIcon } from '../components/icons'
import { Button, ButtonLink, Card, ErrorNotice, Field, Input, Notice, PageHeader, Pill } from '../components/ui'
import { formatPhone } from '../lib/units'
import { ChangePasswordForm } from './ChangePasswordPage'

export function AccountPage() {
  const me = useCurrentUser()
  const setMe = useSetMe()
  const navigate = useNavigate()
  const canManageStaff = useCan('manage_staff')

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setMe(null)
      navigate('/login', { replace: true })
    }
  }

  return (
    <>
      <PageHeader title="My account" subtitle="Your details, photo and password." />

      <div className="grid gap-4 pb-2 lg:grid-cols-[minmax(0,290px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="grid gap-4 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-2xl border border-line-soft bg-white shadow-card">
            {/* Soft plum banner keeps the photo readable on both phone and laptop */}
            <div className="h-20 bg-plum bg-[radial-gradient(circle_at_80%_20%,#6c4152,transparent_60%)]" />
            <div className="-mt-10 grid justify-items-center gap-1 px-4 pb-4 text-center sm:px-5">
              <ProfilePhoto />
              <p className="mt-1 font-display text-2xl leading-tight text-plum">{me.name}</p>
              <p className="text-sm text-ink-muted">@{me.username}</p>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                <Pill tone={me.is_superadmin ? 'default' : 'muted'}>
                  <span className="capitalize">{me.is_superadmin ? 'Superadmin' : me.role}</span>
                </Pill>
                {me.phone && <Pill tone="muted">{formatPhone(me.phone)}</Pill>}
              </div>
            </div>

            <div className="grid gap-2 border-t border-line-soft p-4 sm:p-5">
              <p className="text-xs text-ink-muted">
                {me.created_at ? `With the shop since ${new Date(me.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'Signed in'}
              </p>
              {canManageStaff && (
                <ButtonLink to="/staff" variant="secondary" className="md:hidden">
                  Manage staff
                </ButtonLink>
              )}
              <Button variant="danger" onClick={signOut}>
                <LogoutIcon />
                Sign out
              </Button>
            </div>
          </section>
        </div>

        <div className="grid gap-4">
          <Card title="Your details">
            <DetailsForm />
          </Card>

          <Card title="Password">
            <p className="mb-4 text-sm text-ink-muted">Choose something only you know. Use the eye to check what you typed.</p>
            <ChangePasswordForm />
          </Card>
        </div>
      </div>
    </>
  )
}

/** Photo with change / remove controls; uploads immediately for a single-step flow. */
function ProfilePhoto() {
  const me = useCurrentUser()
  const setMe = useSetMe()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProblem('Choose a JPG, PNG or WebP image.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setProblem('That photo is larger than 4 MB. Pick a smaller one.')
      return
    }
    setProblem(null)
    setBusy(true)
    try {
      setMe(await api.uploadAvatar(file))
    } catch (err) {
      setProblem(toProblem(err).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setProblem(null)
    setBusy(true)
    try {
      setMe(await api.removeAvatar())
    } catch (err) {
      setProblem(toProblem(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid justify-items-center gap-1">
      <div className="relative">
        <Avatar name={me.name} url={me.avatar_url} size="xl" className="shadow-card ring-4 ring-white" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={me.avatar_url ? 'Change photo' : 'Add a photo'}
          className="absolute -right-1 -bottom-1 grid size-10 place-items-center rounded-full bg-rose text-white shadow-md transition hover:bg-rose-dark disabled:opacity-60"
        >
          <CameraIcon />
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">{busy ? 'Saving photo…' : 'JPG, PNG or WebP · up to 4 MB'}</p>
      {me.avatar_url && !busy && (
        <button
          type="button"
          onClick={remove}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition hover:text-danger"
        >
          <TrashIcon /> Remove photo
        </button>
      )}
      {problem && <p className="mt-1 max-w-56 text-xs font-medium text-danger">{problem}</p>}
    </div>
  )
}

function DetailsForm() {
  const me = useCurrentUser()
  const setMe = useSetMe()
  const [name, setName] = useState(me.name)
  const [username, setUsername] = useState(me.username)
  const [phone, setPhone] = useState(me.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = name !== me.name || username !== me.username || phone !== (me.phone ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    setSaved(false)
    try {
      setMe(await api.updateMe({ name, username, phone }))
      setSaved(true)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={problem?.fields.name} className="sm:col-span-2">
          {(a) => <Input {...a} value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} autoComplete="name" />}
        </Field>
        <Field label="Username" error={problem?.fields.username} hint="You can sign in with this.">
          {(a) => (
            <Input {...a} value={username} onChange={(e) => { setUsername(e.target.value); setSaved(false) }} autoComplete="username" autoCapitalize="none" autoCorrect="off" />
          )}
        </Field>
        <Field label="Mobile number" error={problem?.fields.phone} hint="Optional. 0712 345 678 or 254712345678.">
          {(a) => <Input {...a} type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} autoComplete="tel" />}
        </Field>
      </div>

      {problem && problem.message && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
      {saved && <Notice tone="success">Details saved.</Notice>}

      <div className="grid gap-2 sm:flex sm:justify-end">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setName(me.name)
              setUsername(me.username)
              setPhone(me.phone ?? '')
              setProblem(null)
            }}
          >
            Undo changes
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={!dirty || !name.trim() || !username.trim()}>
          Save details
        </Button>
      </div>
    </form>
  )
}
