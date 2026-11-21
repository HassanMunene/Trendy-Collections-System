import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useMe, useSetMe } from '../auth/useMe'
import { Brand } from '../components/AppShell'
import { Button, ErrorNotice, Field, Input, Notice, PasswordInput } from '../components/ui'

export function LoginPage() {
  const { data: me } = useMe()
  const setMe = useSetMe()
  const navigate = useNavigate()
  const location = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const idle = Boolean((location.state as { idle?: boolean } | null)?.idle)

  if (me) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const user = await api.login(login.trim(), password)
      setMe(user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setProblem(toProblem(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh md:grid-cols-2">
      <div className="hidden flex-col justify-end bg-plum bg-[radial-gradient(circle_at_75%_25%,#6c4152,transparent_45%)] p-12 text-blush-100 md:flex">
        <p className="text-xs font-bold tracking-[0.15em] text-blush-300 uppercase">Trendy Collections</p>
        <h1 className="mt-3 max-w-lg font-display text-6xl leading-[1.05]">Every roll, every order, every shilling.</h1>
        <p className="mt-4 max-w-md text-blush-300">Sign in with your own account. Everything you record is saved under your name.</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 md:hidden">
            <Brand />
          </div>
          <h2 className="font-display text-3xl text-plum">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-ink-muted">Use your username or phone number.</p>

          {idle && (
            <div className="mb-5">
              <Notice tone="warn">You were signed out after 12 hours without activity. Sign in to continue where you left off.</Notice>
            </div>
          )}

          <div className="grid gap-4">
            <Field label="Username or phone" error={problem?.fields.login}>
              {(a) => (
                <Input {...a} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" required autoFocus />
              )}
            </Field>
            <Field label="Password" error={problem?.fields.password}>
              {(a) => (
                <PasswordInput {...a} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              )}
            </Field>
            {problem && !problem.fields.login && !problem.fields.password && <ErrorNotice problem={problem} />}
            <Button type="submit" busy={busy} disabled={!login || !password} className="w-full">
              Sign in
            </Button>
          </div>
          <p className="mt-6 text-xs text-ink-muted">Forgot your password? Ask the owner to reset it.</p>
        </form>
      </div>
    </div>
  )
}
