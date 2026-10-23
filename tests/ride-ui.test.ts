import { describe, it, expect } from 'vitest'
import { formatPrice, headingDeg, isTerminal, lerpPoint, ridesCount, STATUS_LABEL } from '@/lib/ride-ui'

describe('ride-ui', () => {
  it('has the Polish status labels from the spec', () => {
    expect(STATUS_LABEL.searching).toBe('Szukamy kierowcy…')
    expect(STATUS_LABEL.accepted).toBe('Kierowca jedzie po Ciebie')
    expect(STATUS_LABEL.in_progress).toBe('W trasie')
    expect(STATUS_LABEL.completed).toBe('Dojechałeś!')
  })
  it('formats PLN in Polish', () => {
    expect(formatPrice(23).replace(/\s/g, ' ')).toBe('23 zł')
    expect(formatPrice(23.5).replace(/\s/g, ' ')).toBe('23,5 zł')
  })
  it('interpolates along the route and clamps', () => {
    const a = { lat: 52, lng: 21 }
    const b = { lat: 53, lng: 22 }
    expect(lerpPoint(a, b, 0.5)).toEqual({ lat: 52.5, lng: 21.5 })
    expect(lerpPoint(a, b, 2)).toEqual(b)
    expect(lerpPoint(a, b, -1)).toEqual(a)
  })
  it('computes heading (0 = north, 90 = east)', () => {
    expect(headingDeg({ lat: 52, lng: 21 }, { lat: 53, lng: 21 })).toBeCloseTo(0)
    expect(headingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90)
    expect(headingDeg({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0)
  })
  it('knows terminal statuses', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('in_progress')).toBe(false)
  })
  it('pluralizes rides in Polish', () => {
    expect(ridesCount(1)).toBe('1 kurs')
    expect(ridesCount(3)).toBe('3 kursy')
    expect(ridesCount(5)).toBe('5 kursów')
    expect(ridesCount(12)).toBe('12 kursów')
    expect(ridesCount(22)).toBe('22 kursy')
  })
})
