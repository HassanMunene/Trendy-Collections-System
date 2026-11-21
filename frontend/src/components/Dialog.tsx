import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { XMarkIcon } from './icons'
import { Button } from './ui'

/**
 * Centred dialog for short tasks. Mount it only while open (or pass `open`).
 * Escape, the scrim and the close button all call `onClose`; focus returns to the opener.
 */
export function Modal({
  open = true,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'default',
}: {
  open?: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'danger'
}) {
  const titleId = useId()
  const descriptionId = useId()
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

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-plum/40 animate-[fade-in_150ms_ease-out] motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-t-2xl bg-white shadow-[0_18px_50px_#35172333] outline-none animate-[dialog-in_170ms_ease-out] motion-reduce:animate-none sm:rounded-2xl',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className={cx('font-display text-2xl leading-tight', tone === 'danger' ? 'text-danger' : 'text-plum')}>
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-ink-muted">
                {description}
              </div>
            )}
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

        {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">{children}</div>}

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-blush-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/** Yes/no check before something hard to undo. Destructive actions use `tone="danger"`. */
export function ConfirmDialog({
  open = true,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
}: {
  open?: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      tone={tone}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} busy={busy} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
