import { useQuery } from '@tanstack/react-query'
import { api } from '../api/endpoints'

export const LOOKUPS_KEY = ['lookups'] as const

export function useLookups() {
  return useQuery({ queryKey: LOOKUPS_KEY, queryFn: api.lookups, staleTime: 10 * 60 * 1000 })
}
