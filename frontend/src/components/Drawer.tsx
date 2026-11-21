import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { XMarkIcon } from './icons'

/**
 * Side panel for short forms. Closes on Escape or scrim click, locks page scroll
 * and returns focus to whatever opened it. Callers usually mount it only while open.
 */
export function Drawer({
  open = true,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open?: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-plum/35 animate-[fade-in_150ms_ease-out] motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex h-dvh w-full flex-col bg-white shadow-[-8px_0_32px_#3517231f] outline-none animate-[drawer-in_180ms_ease-out] motion-reduce:animate-none',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-2xl leading-tight text-plum">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 flex-none place-items-center rounded-lg text-ink-muted transition hover:bg-blush-200 hover:text-ink"
          >
            <XMarkIcon className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-blush-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

export default Drawer
