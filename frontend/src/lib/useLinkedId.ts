import { useSearchParams } from 'react-router'

/**
 * The record a page has open (a sale, order, customer...) kept in the address, e.g. /orders?order=12,
 * so the home screen and shared links can open it directly and the phone's Back button closes it.
 */
export function useLinkedId(key: string): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get(key))
  const id = Number.isInteger(raw) && raw > 0 ? raw : null

  const set = (next: number | null) => {
    setParams(
      (current) => {
        const p = new URLSearchParams(current)
        if (next === null) p.delete(key)
        else p.set(key, String(next))
        return p
      },
      // Opening adds a history entry (Back closes it); closing replaces it.
      { replace: next === null },
    )
  }

  return [id, set]
}
