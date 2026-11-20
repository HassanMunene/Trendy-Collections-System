import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router'
import type { ApiProblem } from '../api/client'
import { cx } from '../lib/cx'


type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-rose text-white hover:bg-rose-dark',
  secondary: 'bg-blush-200 text-plum hover:bg-blush-300',
  ghost: 'bg-transparent text-rose-dark hover:bg-blush-100',
  danger: 'bg-danger text-white hover:brightness-95',
}

export function Button({
  variant = 'primary',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-55',
        buttonStyles[variant],
        className,
      )}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  )
}

export function ButtonLink({ to, children, variant = 'primary', className }: { to: string; children: ReactNode; variant?: ButtonVariant; className?: string }) {
  return (
    <Link
      to={to}
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition', buttonStyles[variant], className)}
    >
      {children}
    </Link>
  )
}

/** Label + control + help text + error, wired up for screen readers. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string
  error?: string
  hint?: ReactNode
  className?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-plum-700">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const controlBase =
  'w-full min-h-11 rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/25 aria-[invalid=true]:border-danger disabled:bg-blush-100'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(controlBase, className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(controlBase, 'pr-8', className)}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(controlBase, 'min-h-22', className)} />
}

/** A text input with a fixed unit shown inside it, e.g. "m" or "KES". */
export function UnitInput({ unit, unitFirst = false, ...rest }: InputHTMLAttributes<HTMLInputElement> & { unit: string; unitFirst?: boolean }) {
  return (
    <div className="relative">
      {unitFirst && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-ink-muted">{unit}</span>}
      <Input inputMode="decimal" autoComplete="off" {...rest} className={unitFirst ? 'pl-14' : 'pr-10'} />
      {!unitFirst && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-ink-muted">{unit}</span>}
    </div>
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-line-soft bg-white p-4 shadow-card sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-xl text-plum">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: { to: string; label: string }; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:pt-7 sm:pb-5">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-rose-dark">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display text-3xl leading-tight tracking-tight text-plum sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1.5 text-ink-muted">{subtitle}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  )
}

export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', small ? 'size-4' : 'size-6')}
    />
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-muted">
      <Spinner /> {label}
    </div>
  )
}

export function ErrorNotice({ problem, onRetry }: { problem: ApiProblem | null | undefined; onRetry?: () => void }) {
  if (!problem) return null
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border-l-4 border-danger bg-danger-soft p-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      <span>{problem.message}</span>
      {onRetry && (
        <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'success' }) {
  const tones = {
    info: 'border-plum-300 bg-blush-100',
    warn: 'border-amber-500 bg-amber-50',
    success: 'border-success bg-success-soft',
  }
  return <div className={cx('rounded-xl border-l-4 p-3 text-sm leading-relaxed text-ink', tones[tone])}>{children}</div>
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-5 py-10 text-center">
      <p className="font-display text-xl text-plum">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'warn' | 'muted' | 'success' }) {
  const tones = {
    default: 'bg-blush-200 text-plum-700',
    warn: 'bg-amber-100 text-amber-800',
    muted: 'bg-stone-100 text-stone-600',
    success: 'bg-success-soft text-success',
  }
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', tones[tone])}>{children}</span>
}

/** Small "label: value" rows for detail screens. */
export function DetailList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Swatch({ name }: { name?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 flex-none rounded-full border border-black/10"
      style={{ background: swatchColour(name) }}
    />
  )
}

// Rough colour hints for common names; unknown names get a neutral dot.
const SWATCHES: Record<string, string> = {
  white: '#ffffff', cream: '#f3e9d2', ivory: '#fffbef', beige: '#e3d3b4', grey: '#9a9a9a', gray: '#9a9a9a',
  silver: '#c9c9cf', brown: '#7b5236', gold: '#c9a24a', maroon: '#6d1a2c', red: '#c0392b', pink: '#e79ab6',
  purple: '#7d4a8c', blue: '#3c6fb6', navy: '#1f2f56', green: '#4f8a55', black: '#1d1d1d', teal: '#2c8c8c',
}

function swatchColour(name?: string) {
  if (!name) return '#ddd'
  const key = name.toLowerCase().split(/\s+/).find((w) => w in SWATCHES)
  return key ? SWATCHES[key] : '#d9cdd2'
}
