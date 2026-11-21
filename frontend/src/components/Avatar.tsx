import { cx } from '../lib/cx'

const sizes = {
  xs: 'size-8 text-xs',
  sm: 'size-9 text-sm',
  lg: 'size-20 text-2xl sm:size-24',
  xl: 'size-24 text-3xl sm:size-28',
}

/** Profile photo with a stable initials fallback, so layouts never collapse. */
export function Avatar({
  name,
  url,
  size = 'sm',
  className,
}: {
  name: string
  url?: string | null
  size?: keyof typeof sizes
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <span
      className={cx(
        'relative inline-grid flex-none place-items-center overflow-hidden rounded-full bg-blush-200 font-display font-semibold text-plum ring-2 ring-white',
        sizes[size],
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initials || '?'}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}
