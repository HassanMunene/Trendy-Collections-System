import { describe, expect, it } from 'vitest'
import { cmToMetreInput, formatChange, formatKes, formatMetres, formatPhone, metresToCm, shillingsToCents } from './units'

describe('metresToCm', () => {
  it('converts metres typed by staff to whole centimetres', () => {
    expect(metresToCm('50')).toBe(5000)
    expect(metresToCm('1.25')).toBe(125)
    expect(metresToCm('12.5')).toBe(1250)
    expect(metresToCm(' 0.1 ')).toBe(10)
    expect(metresToCm('12,5')).toBe(1250)
    expect(metresToCm('3.')).toBe(300)
    expect(metresToCm('12.500')).toBe(1250)
  })

  it('never drifts like floating point does', () => {
    // 0.29 * 100 === 28.999999999999996 in JavaScript
    expect(metresToCm('0.29')).toBe(29)
    expect(metresToCm('1.15')).toBe(115)
    expect(metresToCm('4.35')).toBe(435)
  })

  it('refuses nonsense and sub-centimetre precision', () => {
    expect(metresToCm('')).toBeNull()
    expect(metresToCm('abc')).toBeNull()
    expect(metresToCm('-2')).toBeNull()
    expect(metresToCm('0.005')).toBeNull()
    expect(metresToCm('1.2.3')).toBeNull()
    expect(metresToCm('1e3')).toBeNull()
  })
})

describe('shillingsToCents', () => {
  it('reads shillings with thousands separators', () => {
    expect(shillingsToCents('20,000')).toBe(2000000)
    expect(shillingsToCents('KES 850')).toBe(85000)
    expect(shillingsToCents('99.50')).toBe(9950)
    expect(shillingsToCents('0')).toBe(0)
  })

  it('rejects invalid amounts', () => {
    expect(shillingsToCents('')).toBeNull()
    expect(shillingsToCents('12.345')).toBeNull()
    expect(shillingsToCents('-5')).toBeNull()
  })
})

describe('formatting', () => {
  it('formats lengths with their unit', () => {
    expect(formatMetres(5000)).toBe('50.00 m')
    expect(formatMetres(123456)).toBe('1,234.56 m')
    expect(formatMetres(null)).toBe('—')
    expect(formatChange(-200)).toBe('−2.00 m')
    expect(formatChange(5000)).toBe('+50.00 m')
    expect(cmToMetreInput(1250)).toBe('12.50')
    expect(cmToMetreInput(5)).toBe('0.05')
  })

  it('formats shillings', () => {
    expect(formatKes(2000000)).toBe('KES 20,000')
    expect(formatKes(2000050)).toBe('KES 20,000.50')
    expect(formatKes(0)).toBe('KES 0')
  })

  it('formats Kenyan phone numbers', () => {
    expect(formatPhone('254712345678')).toBe('0712 345 678')
    expect(formatPhone(null)).toBe('')
  })
})
