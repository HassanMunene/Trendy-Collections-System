/*
 * Lengths are stored as whole centimetres and money as whole cents, exactly like the backend.
 * Staff type metres and shillings; we convert once, using string arithmetic so that
 * 0.1 + 0.2 style floating-point errors can never change a stock balance or a price.
 */

/** "12.5" -> 1250. Accepts "12", "12.50" and "12,5". Returns null if invalid or more precise than 1 cm. */
export function metresToCm(input: string): number | null {
  const parsed = parseDecimal(input, 2)
  return parsed === null ? null : parsed
}

/** "20,000" or "20000.50" -> cents. Returns null if invalid. */
export function shillingsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^KES\s*/i, '').replace(/,/g, '')
  return parseDecimal(cleaned, 2, false)
}

/**
 * Parse a non-negative decimal into an integer of the given scale (2 -> hundredths).
 * With allowCommaDecimal, a lone comma is treated as a decimal point ("12,5" -> 12.5).
 */
function parseDecimal(input: string, scale: number, allowCommaDecimal = true): number | null {
  let s = input.trim().replace(/\s+/g, '')
  if (allowCommaDecimal && !s.includes('.') && /^\d+,\d+$/.test(s)) s = s.replace(',', '.')
  const match = /^(\d+)(?:\.(\d*))?$/.exec(s)
  if (!match) return null
  const [, whole, fraction = ''] = match
  if (fraction.length > scale) {
    // Allow trailing zeros beyond the scale ("12.500"), refuse real extra precision ("0.005").
    if (/[^0]/.test(fraction.slice(scale))) return null
  }
  const padded = (fraction + '0'.repeat(scale)).slice(0, scale)
  const value = Number(whole) * 10 ** scale + Number(padded || '0')
  return Number.isSafeInteger(value) ? value : null
}

const metreFormat = new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1250 -> "12.50 m" */
export function formatMetres(cm: number | null | undefined, withUnit = true): string {
  if (cm === null || cm === undefined) return '—'
  const text = metreFormat.format(cm / 100)
  return withUnit ? `${text} m` : text
}

/** 1250 -> "12.50" for pre-filling an input. */
export function cmToMetreInput(cm: number | null | undefined): string {
  if (cm === null || cm === undefined) return ''
  const sign = cm < 0 ? '-' : ''
  const abs = Math.abs(cm)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Signed change for movement lists: +50.00 m / −2.00 m */
export function formatChange(cm: number): string {
  const text = formatMetres(Math.abs(cm))
  return cm > 0 ? `+${text}` : `−${text}`
}

/** 2000050 -> "KES 20,000.50"; whole shillings drop the decimals: "KES 20,000". */
export function formatKes(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const whole = cents % 100 === 0
  return (
    'KES ' +
    new Intl.NumberFormat('en-KE', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  )
}

/** "254712345678" -> "0712 345 678" */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const m = /^254(\d{3})(\d{3})(\d{3})$/.exec(phone)
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone
}

const dateTime = new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const dateOnly = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—'
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso.length === 10 ? `${iso}T12:00:00+03:00` : iso)) : '—'
}

/** plural(1, 'roll') -> "1 roll", plural(3, 'roll') -> "3 rolls" */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}
