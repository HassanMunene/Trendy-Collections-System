import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { AlertTriangleIcon, CheckCircleIcon, XMarkIcon } from './icons'
import { ToastContext, type ToastApi, type ToastTone } from './toast-context'

interface ToastItem {
  id: number
  tone: ToastTone
  message: ReactNode
}

const styles: Record<ToastTone, { border: string; icon: string }> = {
  success: { border: 'border-success', icon: 'text-success' },
  error: { border: 'border-danger', icon: 'text-danger' },
  info: { border: 'border-plum-300', icon: 'text-plum' },
}

const DURATION = { success: 4500, info: 5000, error: 8000 }

/** Mount once near the app root. Screens call `useToast().success(...)` after an action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, message: ReactNode) => {
      const id = nextId.current++
      setItems((current) => [...current.slice(-3), { id, tone, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[tone]),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 bg-white px-3.5 py-3 shadow-[0_10px_30px_#35172326] animate-[toast-in_160ms_ease-out] motion-reduce:animate-none',
              styles[item.tone].border,
            )}
          >
            <span className={cx('mt-0.5 flex-none', styles[item.tone].icon)}>
              {item.tone === 'error' ? <AlertTriangleIcon size={20} /> : <CheckCircleIcon size={20} />}
            </span>
            <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{item.message}</div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="-mr-1 grid size-7 flex-none place-items-center rounded-md text-ink-muted hover:bg-blush-200 hover:text-ink"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
