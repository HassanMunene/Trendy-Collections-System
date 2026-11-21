import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/endpoints'
import { ME_KEY } from './useMe'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Sign the person out after a long stretch with no interaction. The server expires the
 * session on its own (SESSION_LIFETIME); this keeps the screen honest when the tab is
 * left open, and tells them why they have been signed out.
 */
export function useIdleLogout(lifetimeSeconds: number) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    const ms = lifetimeSeconds * 1000
    if (!Number.isFinite(ms) || ms <= 0) return

    let deadline = Date.now() + ms
    let lastArmed = 0
    let timer: ReturnType<typeof setTimeout>
    let signingOut = false

    const signOut = async () => {
      if (signingOut) return
      signingOut = true
      // The session may already have expired on the server; either way we are done here.
      await api.logout().catch(() => {})
      qc.clear()
      qc.setQueryData(ME_KEY, null)
      navigate('/login', { replace: true, state: { idle: true } })
    }

    const check = () => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        void signOut()
        return
      }
      clearTimeout(timer)
      timer = setTimeout(check, remaining)
    }

    const arm = () => {
      lastArmed = Date.now()
      clearTimeout(timer)
      timer = setTimeout(check, Math.max(0, deadline - Date.now()))
    }

    const activity = () => {
      deadline = Date.now() + ms
      // Scroll and pointer events are frequent; re-arm at most every few seconds.
      if (Date.now() - lastArmed > 5000) arm()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check()
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, activity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibilityChange)
    arm()

    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, activity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [lifetimeSeconds, navigate, qc])
}
