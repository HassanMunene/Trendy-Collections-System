import { createContext, useContext, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastApi {
  success: (message: ReactNode) => void
  error: (message: ReactNode) => void
  info: (message: ReactNode) => void
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Screens call this after an action to confirm it worked, or to explain a failure. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
