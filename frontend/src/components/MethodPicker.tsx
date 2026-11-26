import type { PaymentMethod } from '../api/types'
import { cx } from '../lib/cx'
import { PAYMENT_METHODS } from '../lib/payments'
import { Field, Input } from './ui'

/** Big tap targets for how money moved, plus the M-Pesa code when it went through M-Pesa. */
export function MethodPicker<M extends PaymentMethod>({
  methods,
  value,
  onChange,
  code,
  onCode,
  codeError,
  labels = {},
}: {
  methods: M[]
  value: M
  onChange: (m: M) => void
  code?: string
  onCode?: (code: string) => void
  codeError?: string
  labels?: Partial<Record<PaymentMethod, string>>
}) {
  const options = PAYMENT_METHODS.filter((m) => (methods as PaymentMethod[]).includes(m.key))
  const isMpesa = options.find((m) => m.key === value)?.mpesa ?? false
  return (
    <div className="grid gap-3">
      <div className={cx('grid gap-2', options.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {options.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={value === m.key}
            onClick={() => onChange(m.key as M)}
            className={cx(
              'min-h-14 rounded-xl border px-2 py-2 text-center transition',
              value === m.key ? 'border-rose bg-rose text-white' : 'border-line bg-white text-plum hover:bg-blush-100',
            )}
          >
            <span className="block font-bold">{labels[m.key] ?? m.label}</span>
            <span className={cx('block text-xs', value === m.key ? 'text-white/85' : 'text-ink-muted')}>{m.hint}</span>
          </button>
        ))}
      </div>
      {isMpesa && onCode && (
        <Field label="M-Pesa code" error={codeError} hint="From the M-Pesa message, e.g. TKL3X9ABCD. Optional, but it lets us match the statement.">
          {(a) => (
            <Input
              {...a}
              value={code ?? ''}
              onChange={(e) => onCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="tabular tracking-wider uppercase"
              maxLength={12}
            />
          )}
        </Field>
      )}
    </div>
  )
}
