import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../api/endpoints'
import { useToast } from '../components/toast-context'
import { ME_KEY } from './useMe'

const CHECK_EVERY_MS = 15_000

/**
 * Pick up role or permission changes without a reload. A tiny fingerprint endpoint is
 * checked while the tab is visible; when it differs, the signed-in user is refetched and
 * the whole shell re-renders with the new access.
 */
export function useLivePermissions() {
  const qc = useQueryClient()
  const toast = useToast()
  const fingerprint = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let checking = false

    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const { fingerprint: next } = await api.permissionFingerprint()
        if (cancelled) return
        if (fingerprint.current !== null && fingerprint.current !== next) {
          toast.info('Your access was updated.')
          await qc.invalidateQueries({ queryKey: ME_KEY })
        }
        fingerprint.current = next
      } catch {
        // A 401 is handled by the session watcher; network hiccups wait for the next check.
      } finally {
        checking = false
      }
    }

    void check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void check()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [qc, toast])
}
