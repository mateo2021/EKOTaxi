import { describe, it, expect } from 'vitest'
import { statusAt, progressFraction, shouldNotify, pickDriver } from '@/lib/ride-status'
import type { Driver } from '@/lib/types'

const t0 = new Date('2026-01-01T12:00:00Z')
const at = (ms: number) => new Date(t0.getTime() + ms)

describe('statusAt', () => {
  it('derives status from elapsed time', () => {
    expect(statusAt(t0, at(4_900), 'searching')).toBe('searching')
    expect(statusAt(t0, at(5_000), 'searching')).toBe('accepted')
    expect(statusAt(t0, at(35_000), 'searching')).toBe('in_progress')
    expect(statusAt(t0, at(95_000), 'searching')).toBe('completed')
  })
  it('catches up after a long time', () => {
    expect(statusAt(t0, at(10 * 60_000), 'searching')).toBe('completed')
  })
  it('terminal statuses are unchanged', () => {
    expect(statusAt(t0, at(10 * 60_000), 'cancelled')).toBe('cancelled')
    expect(statusAt(t0, at(1_000), 'completed')).toBe('completed')
  })
  it('never goes backwards', () => {
    expect(statusAt(t0, at(1_000), 'in_progress')).toBe('in_progress')
  })
  it('treats clock skew as zero elapsed', () => {
    expect(statusAt(t0, at(-5_000), 'searching')).toBe('searching')
  })
})

describe('progressFraction', () => {
  it('is 0 before in_progress, linear, then 1', () => {
    expect(progressFraction(t0, at(20_000))).toBe(0)
    expect(progressFraction(t0, at(65_000))).toBe(0.5)
    expect(progressFraction(t0, at(200_000))).toBe(1)
  })
})

describe('shouldNotify', () => {
  it('notifies only on change when enabled', () => {
    expect(shouldNotify('accepted', 'searching', true)).toBe(true)
    expect(shouldNotify('accepted', 'accepted', true)).toBe(false)
    expect(shouldNotify('accepted', null, false)).toBe(false)
  })
})

describe('pickDriver', () => {
  const drivers: Driver[] = [
    { id: '1', name: 'A', car: 'x', plate: 'P1', rating: 4.5, class: 'economy' },
    { id: '2', name: 'B', car: 'y', plate: 'P2', rating: 4.8, class: 'xl' },
  ]
  it('returns a driver of the class', () => {
    expect(pickDriver(drivers, 'xl', () => 0)?.id).toBe('2')
  })
  it('falls back to any driver', () => {
    expect(pickDriver(drivers, 'comfort', () => 0.99)?.id).toBe('2')
  })
  it('returns null for empty list', () => {
    expect(pickDriver([], 'economy')).toBeNull()
  })
})
