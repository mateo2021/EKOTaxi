import type { Driver, RideClass, RideStatus } from '@/lib/types'

export const STATUS_THRESHOLDS_MS = {
  accepted: 5_000,
  in_progress: 35_000,
  completed: 95_000,
} as const

const ORDER: RideStatus[] = ['searching', 'accepted', 'in_progress', 'completed']

function elapsedMs(createdAt: Date, now: Date): number {
  return Math.max(0, now.getTime() - createdAt.getTime())
}

export function statusAt(createdAt: Date, now: Date, current: RideStatus): RideStatus {
  if (current === 'cancelled' || current === 'completed') return current
  const t = elapsedMs(createdAt, now)
  let derived: RideStatus = 'searching'
  if (t >= STATUS_THRESHOLDS_MS.completed) derived = 'completed'
  else if (t >= STATUS_THRESHOLDS_MS.in_progress) derived = 'in_progress'
  else if (t >= STATUS_THRESHOLDS_MS.accepted) derived = 'accepted'
  return ORDER.indexOf(derived) >= ORDER.indexOf(current) ? derived : current
}

export function progressFraction(createdAt: Date, now: Date): number {
  const t = elapsedMs(createdAt, now)
  const { in_progress, completed } = STATUS_THRESHOLDS_MS
  return Math.min(1, Math.max(0, (t - in_progress) / (completed - in_progress)))
}

export function shouldNotify(
  next: RideStatus,
  lastNotified: RideStatus | null,
  notifyEnabled: boolean,
): boolean {
  return notifyEnabled && next !== lastNotified
}

export function pickDriver(
  drivers: Driver[],
  cls: RideClass,
  rand: () => number = Math.random,
): Driver | null {
  if (drivers.length === 0) return null
  const matching = drivers.filter((d) => d.class === cls)
  const pool = matching.length > 0 ? matching : drivers
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
}
