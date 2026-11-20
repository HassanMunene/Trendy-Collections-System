import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCurrentUser, useSetMe } from '../auth/useMe'
import { Button, Card, ErrorNotice, Field, Input, Notice, PageHeader } from '../components/ui'

/** Used both for the forced first change and from My account. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const setMe = useSetMe()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      setProblem({ status: 422, message: '', fields: { password: 'The two new passwords do not match.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      setMe(await api.changePassword({ current_password: current, password: next, password_confirmation: confirm }))
      setCurrent('')
      setNext('')
      setConfirm('')
      setSaved(true)
      onDone?.()
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field label="Current password" error={problem?.fields.current_password}>
        {(a) => <Input {...a} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />}
      </Field>
      <Field label="New password" error={problem?.fields.password} hint="At least 8 characters. Don't share it with anyone.">
        {(a) => <Input {...a} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
      </Field>
      <Field label="Type the new password again">
        {(a) => <Input {...a} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
      </Field>
      {problem && problem.message && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
      {saved && <Notice tone="success">Password changed.</Notice>}
      <Button type="submit" busy={busy} disabled={!current || !next || !confirm}>
        Save new password
      </Button>
    </form>
  )
}

export function ChangePasswordPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-md px-4 pb-10">
      <PageHeader title="Set your own password" subtitle={`Welcome, ${me.name}. The owner gave you a temporary password; choose your own before you start.`} />
      <Card>
        <ChangePasswordForm onDone={() => navigate('/', { replace: true })} />
      </Card>
    </div>
  )
}
