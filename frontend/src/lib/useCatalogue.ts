import { useQuery } from '@tanstack/react-query'
import { api } from '../api/endpoints'

export const PRODUCT_CATEGORIES_KEY = ['product-categories'] as const
export const PRODUCTS_KEY = ['products'] as const
export const CUSTOMERS_KEY = ['customers'] as const

/** Window curtain, door curtain, sheer, pillow case… in the shop's own order. */
export function useProductCategories() {
  return useQuery({ queryKey: PRODUCT_CATEGORIES_KEY, queryFn: api.productCategories, staleTime: 10 * 60 * 1000 })
}

/** Every active product. Small enough (a few hundred) to filter on the phone without waiting on the network. */
export function useProducts(includeInactive = false) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, { includeInactive }],
    queryFn: () => api.products({ include_inactive: includeInactive }),
    staleTime: 30 * 1000,
  })
}

/** "Window curtain – Grey · Blackout", matching the name the server will save. */
export function productName(category: string, colour?: string, variant = ''): string {
  const details = [colour?.trim() ?? '', variant.trim().replace(/\s+/g, ' ')].filter(Boolean)
  return details.length ? `${category} – ${details.join(' · ')}` : category
}

/** "3 sets", "1 piece", "2 pairs". */
export function quantityLabel(quantity: number, unit: string): string {
  const words: Record<string, [string, string]> = {
    set: ['set', 'sets'],
    piece: ['piece', 'pieces'],
    pcs: ['pc', 'pcs'],
    pair: ['pair', 'pairs'],
    job: ['job', 'jobs'],
    m: ['m', 'm'],
  }
  const [one, many] = words[unit] ?? [unit, unit]
  return `${quantity} ${quantity === 1 ? one : many}`
}
