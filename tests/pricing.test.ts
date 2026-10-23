import { describe, it, expect } from 'vitest'
import { haversineKm, estimateDistanceKm, priceFor } from '@/lib/pricing'

describe('pricing', () => {
  it('haversineKm: Warszawa Centralna -> Lotnisko Chopina ~7.4 km', () => {
    const d = haversineKm({ lat: 52.2289, lng: 21.0034 }, { lat: 52.1657, lng: 20.9671 })
    expect(Math.abs(d - 7.4)).toBeLessThanOrEqual(0.2)
  })

  it('priceFor: minimum and class multipliers', () => {
    expect(priceFor(0, 'economy')).toBe(10)
    expect(priceFor(10, 'economy')).toBe(35)
    expect(priceFor(10, 'comfort')).toBe(46)
    expect(priceFor(10, 'xl')).toBe(56)
  })

  it('estimateDistanceKm: same point is 0', () => {
    const p = { lat: 52.2289, lng: 21.0034 }
    expect(estimateDistanceKm(p, p)).toBe(0)
  })
})
