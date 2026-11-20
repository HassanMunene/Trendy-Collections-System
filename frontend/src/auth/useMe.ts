import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '../api/endpoints'
import type { Me, Permissions } from '../api/types'

export const ME_KEY = ['me'] as const

/** The signed-in staff member, or null when signed out. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.me()
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/** Use inside the signed-in area, where `me` is guaranteed. */
export function useCurrentUser(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentUser used outside the signed-in area')
  return data
}

export function useCan(permission: keyof Permissions): boolean {
  const { data } = useMe()
  return data?.permissions[permission] ?? false
}

export function useSetMe() {
  const qc = useQueryClient()
  return (me: Me | null) => {
    if (me === null) qc.clear()
    qc.setQueryData(ME_KEY, me)
  }
}
