import { RIDE_CLASSES } from '@/lib/profile'
import { progressFraction, shouldNotify } from '@/lib/ride-status'
import type { Ride, RideClass, RideStatus } from '@/lib/types'

export const MAX_ADDRESS = 200

/** Statusy, w których kurs blokuje zamówienie kolejnego. */
export const ACTIVE_STATUSES: readonly RideStatus[] = ['searching', 'accepted', 'in_progress']
/** Statusy, z których wolno anulować. */
export const CANCELLABLE_STATUSES: readonly RideStatus[] = ['searching', 'accepted']

export interface Place {
  address: string
  lat: number
  lng: number
}

export interface CreateRideInput {
  pickup: Place
  dropoff: Place
  class: RideClass
}

export type CreateRideParse = { ok: true; value: CreateRideInput } | { ok: false; error: string }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function inRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
}

function parsePlace(raw: unknown, label: string): { ok: true; value: Place } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: `Brak danych miejsca: ${label}` }
  const address = typeof raw.address === 'string' ? raw.address.trim() : ''
  if (address.length < 1) return { ok: false, error: `Podaj adres: ${label}` }
  if (address.length > MAX_ADDRESS) {
    return { ok: false, error: `Adres (${label}) może mieć najwyżej ${MAX_ADDRESS} znaków` }
  }
  if (!inRange(raw.lat, -90, 90)) return { ok: false, error: `Nieprawidłowa szerokość geograficzna: ${label}` }
  if (!inRange(raw.lng, -180, 180)) return { ok: false, error: `Nieprawidłowa długość geograficzna: ${label}` }
  return { ok: true, value: { address, lat: raw.lat, lng: raw.lng } }
}

/** Walidacja body `POST /api/rides`. Cena nigdy nie pochodzi od klienta. */
export function parseCreateRideBody(json: unknown): CreateRideParse {
  if (!isObject(json)) return { ok: false, error: 'Nieprawidłowe dane zamówienia' }
  const pickup = parsePlace(json.pickup, 'odbiór')
  if (!pickup.ok) return pickup
  const dropoff = parsePlace(json.dropoff, 'cel')
  if (!dropoff.ok) return dropoff
  const cls = json.class
  if (typeof cls !== 'string' || !RIDE_CLASSES.includes(cls as RideClass)) {
    return { ok: false, error: 'Wybierz klasę przejazdu' }
  }
  return { ok: true, value: { pickup: pickup.value, dropoff: dropoff.value, class: cls as RideClass } }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

export function isActiveStatus(s: RideStatus): boolean {
  return ACTIVE_STATUSES.includes(s)
}

export function canCancel(s: RideStatus): boolean {
  return CANCELLABLE_STATUSES.includes(s)
}

/**
 * Czy wysłać powiadomienie o bieżącym statusie. `searching` jest stanem
 * początkowym, nie zmianą — nie powiadamiamy o nim.
 */
export function wantsNotification(
  status: RideStatus,
  lastNotified: RideStatus | null,
  notifyEnabled: boolean,
): boolean {
  return status !== 'searching' && shouldNotify(status, lastNotified, notifyEnabled)
}

/** Postęp trasy 0..1 do paska na mapie. */
export function rideProgress(ride: Pick<Ride, 'status' | 'created_at'>, now: Date): number {
  if (ride.status === 'completed') return 1
  if (ride.status === 'cancelled') return 0
  return progressFraction(new Date(ride.created_at), now)
}
