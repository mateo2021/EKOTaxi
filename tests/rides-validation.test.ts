import { describe, expect, it } from 'vitest'
import {
  MAX_ADDRESS,
  canCancel,
  isActiveStatus,
  isUuid,
  parseCreateRideBody,
  rideProgress,
  wantsNotification,
} from '@/lib/rides-validation'

const valid = {
  pickup: { address: '  Marszałkowska 1, Warszawa ', lat: 52.23, lng: 21.01 },
  dropoff: { address: 'Lotnisko Chopina', lat: 52.165, lng: 20.967 },
  class: 'comfort',
}

function withPickup(p: Record<string, unknown>) {
  return { ...valid, pickup: { ...valid.pickup, ...p } }
}

describe('parseCreateRideBody', () => {
  it('przyjmuje poprawne dane i przycina adresy', () => {
    expect(parseCreateRideBody(valid)).toEqual({
      ok: true,
      value: {
        pickup: { address: 'Marszałkowska 1, Warszawa', lat: 52.23, lng: 21.01 },
        dropoff: { address: 'Lotnisko Chopina', lat: 52.165, lng: 20.967 },
        class: 'comfort',
      },
    })
  })

  it('ignoruje cenę podaną przez klienta', () => {
    const r = parseCreateRideBody({ ...valid, price_pln: 1 })
    expect(r.ok && 'price_pln' in r.value).toBe(false)
  })

  it('akceptuje wartości graniczne współrzędnych', () => {
    expect(parseCreateRideBody(withPickup({ lat: -90, lng: 180 })).ok).toBe(true)
    expect(parseCreateRideBody(withPickup({ lat: 90, lng: -180 })).ok).toBe(true)
  })

  it.each([
    [{ lat: 90.01 }],
    [{ lat: -91 }],
    [{ lng: 180.5 }],
    [{ lng: -181 }],
    [{ lat: Number.NaN }],
    [{ lng: Number.POSITIVE_INFINITY }],
    [{ lat: '52.2' }],
  ])('odrzuca współrzędne spoza zakresu / złego typu %o', (p) => {
    expect(parseCreateRideBody(withPickup(p)).ok).toBe(false)
  })

  it('odrzuca zbyt długi adres, przyjmuje dokładnie limit', () => {
    expect(parseCreateRideBody(withPickup({ address: 'a'.repeat(MAX_ADDRESS + 1) })).ok).toBe(false)
    expect(parseCreateRideBody(withPickup({ address: 'a'.repeat(MAX_ADDRESS) })).ok).toBe(true)
  })

  it('odrzuca pusty adres', () => {
    expect(parseCreateRideBody(withPickup({ address: '   ' })).ok).toBe(false)
  })

  it('odrzuca nieznaną klasę', () => {
    expect(parseCreateRideBody({ ...valid, class: 'limo' }).ok).toBe(false)
  })

  it.each([
    ['brak body', null],
    ['tablica', []],
    ['brak pickup', { dropoff: valid.dropoff, class: 'xl' }],
    ['brak dropoff', { pickup: valid.pickup, class: 'xl' }],
    ['brak class', { pickup: valid.pickup, dropoff: valid.dropoff }],
    ['brak lat', { ...valid, dropoff: { address: 'x', lng: 1 } }],
  ])('odrzuca brakujące pola: %s', (_n, body) => {
    const r = parseCreateRideBody(body)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/\S/)
  })
})

describe('pomocnicze', () => {
  it('isUuid', () => {
    expect(isUuid('3f2b1c4e-8a9d-4c1e-9b7a-0123456789ab')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
  })

  it('statusy aktywne i anulowalne', () => {
    expect(['searching', 'accepted', 'in_progress'].every((s) => isActiveStatus(s as never))).toBe(true)
    expect(isActiveStatus('completed')).toBe(false)
    expect(canCancel('searching')).toBe(true)
    expect(canCancel('accepted')).toBe(true)
    expect(canCancel('in_progress')).toBe(false)
    expect(canCancel('completed')).toBe(false)
    expect(canCancel('cancelled')).toBe(false)
  })

  it('wantsNotification: nigdy o searching, raz o każdym statusie, szanuje preferencję', () => {
    expect(wantsNotification('searching', null, true)).toBe(false)
    expect(wantsNotification('accepted', null, true)).toBe(true)
    expect(wantsNotification('accepted', 'accepted', true)).toBe(false)
    expect(wantsNotification('completed', 'accepted', true)).toBe(true)
    expect(wantsNotification('cancelled', null, true)).toBe(true)
    expect(wantsNotification('completed', 'accepted', false)).toBe(false)
  })

  it('rideProgress', () => {
    const created = '2026-10-23T10:00:00.000Z'
    const at = (s: number) => new Date(Date.parse(created) + s * 1000)
    expect(rideProgress({ status: 'accepted', created_at: created }, at(10))).toBe(0)
    expect(rideProgress({ status: 'in_progress', created_at: created }, at(65))).toBeCloseTo(0.5)
    expect(rideProgress({ status: 'completed', created_at: created }, at(1))).toBe(1)
    expect(rideProgress({ status: 'cancelled', created_at: created }, at(500))).toBe(0)
  })
})
