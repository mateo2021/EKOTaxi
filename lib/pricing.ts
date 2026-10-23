import type { RideClass } from '@/lib/types'

export type LatLng = { lat: number; lng: number }

export const BASE_FARE_PLN = 5
export const PER_KM_PLN = 3
export const MIN_FARE_PLN = 10
export const ROUTE_FACTOR = 1.3
export const CLASS_MULTIPLIER: Record<RideClass, number> = {
  economy: 1.0,
  comfort: 1.3,
  xl: 1.6,
}

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function estimateDistanceKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROUTE_FACTOR * 10) / 10
}

export function priceFor(distanceKm: number, cls: RideClass): number {
  return Math.max(
    MIN_FARE_PLN,
    Math.round((BASE_FARE_PLN + PER_KM_PLN * distanceKm) * CLASS_MULTIPLIER[cls]),
  )
}
