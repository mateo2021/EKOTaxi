import 'server-only'
import { after } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { estimateDistanceKm, priceFor } from '@/lib/pricing'
import { pickDriver, statusAt } from '@/lib/ride-status'
import { resolveWebhook, rideStatusMessage, sendDiscord } from '@/lib/discord'
import {
  ACTIVE_STATUSES,
  CANCELLABLE_STATUSES,
  canCancel,
  isActiveStatus,
  isUuid,
  wantsNotification,
  type CreateRideInput,
} from '@/lib/rides-validation'
import type { Driver, Ride, RideStatus } from '@/lib/types'

type Admin = ReturnType<typeof createAdminSupabase>

/** Ile razy ponawiamy po przegranym wyścigu warunkowego UPDATE. */
const MAX_ATTEMPTS = 3

export class RideNotFoundError extends Error {
  constructor() {
    super('Ride not found')
  }
}

export class RideConflictError extends Error {
  constructor(message: string) {
    super(message)
  }
}

/** Id zalogowanego użytkownika (z cookie) albo null. */
export async function getApiUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

async function loadRide(admin: Admin, rideId: string, userId: string): Promise<Ride> {
  if (!isUuid(rideId)) throw new RideNotFoundError()
  const { data, error } = await admin
    .from('rides')
    .select('*')
    .eq('id', rideId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new RideNotFoundError()
  return data as Ride
}

async function loadDriver(admin: Admin, driverId: string | null): Promise<Driver | null> {
  if (!driverId) return null
  const { data, error } = await admin.from('drivers').select('*').eq('id', driverId).maybeSingle()
  if (error) throw error
  return (data as Driver | null) ?? null
}

async function chooseDriver(admin: Admin, ride: Ride): Promise<string | null> {
  const { data, error } = await admin.from('drivers').select('*')
  if (error) throw error
  return pickDriver((data ?? []) as Driver[], ride.class)?.id ?? null
}

/**
 * Doprowadza status w bazie do `statusAt(...)`. UPDATE jest warunkowy na starym
 * statusie — przy dwóch kartach wygrywa jedna, przegrana przeładowuje wiersz.
 */
async function syncStatus(admin: Admin, ride: Ride, userId: string, now: Date): Promise<Ride> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const next = statusAt(new Date(ride.created_at), now, ride.status)
    if (next === ride.status) return ride

    const patch: Partial<Ride> = { status: next }
    // Kierowca potrzebny od `accepted` wzwyż — także przy przeskoku searching → completed.
    if (!ride.driver_id) patch.driver_id = await chooseDriver(admin, ride)

    const { data, error } = await admin
      .from('rides')
      .update(patch)
      .eq('id', ride.id)
      .eq('user_id', userId)
      .eq('status', ride.status)
      .select('*')
    if (error) throw error
    if (data && data.length === 1) return data[0] as Ride
    // Przegrany wyścig: ktoś inny już przesunął status — czytamy aktualny stan.
    ride = await loadRide(admin, ride.id, userId)
  }
  return ride
}

/**
 * Powiadomienie o BIEŻĄCYM statusie (przy przeskoku kilku statusów — tylko o ostatnim).
 * Dokładnie raz: claim to warunkowy UPDATE `last_notified_status`, wysyłamy tylko
 * gdy zmienił dokładnie 1 wiersz. Wysyłka po odpowiedzi (`after`), błąd tylko logowany.
 */
async function maybeNotify(admin: Admin, ride: Ride, userId: string): Promise<Ride> {
  // Tani filtr przed odczytem profilu.
  if (!wantsNotification(ride.status, ride.last_notified_status, true)) return ride

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('notify_ride_status, discord_webhook_url')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw profileError
  const notifyEnabled = (profile?.notify_ride_status as boolean | undefined) ?? true
  if (!wantsNotification(ride.status, ride.last_notified_status, notifyEnabled)) return ride
  const webhook = resolveWebhook((profile?.discord_webhook_url as string | null | undefined) ?? null)
  if (!webhook) return ride

  const prev = ride.last_notified_status
  let claim = admin
    .from('rides')
    .update({ last_notified_status: ride.status })
    .eq('id', ride.id)
    .eq('status', ride.status)
  claim = prev === null ? claim.is('last_notified_status', null) : claim.eq('last_notified_status', prev)
  const { data: claimed, error: claimError } = await claim.select('id')
  if (claimError) throw claimError
  if (!claimed || claimed.length !== 1) return ride // ktoś inny już powiadomił

  const driver = await loadDriver(admin, ride.driver_id)
  const content = rideStatusMessage(ride.status, driver, ride)
  const rideId = ride.id
  const status = ride.status
  after(async () => {
    const ok = await sendDiscord(webhook, content)
    if (!ok) console.warn(`[rides] Discord: nie wysłano powiadomienia ${status} dla kursu ${rideId}`)
  })
  return { ...ride, last_notified_status: ride.status }
}

/** Odczyt kursu z wyliczeniem statusu z upływu czasu + ewentualne powiadomienie. */
export async function advanceRide(
  rideId: string,
  userId: string,
  now: Date,
): Promise<{ ride: Ride; driver: Driver | null }> {
  const admin = createAdminSupabase()
  let ride = await loadRide(admin, rideId, userId)
  ride = await syncStatus(admin, ride, userId, now)
  ride = await maybeNotify(admin, ride, userId)
  return { ride, driver: await loadDriver(admin, ride.driver_id) }
}

/** Aktywny kurs użytkownika (po przeliczeniu statusu) albo null. */
export async function findActiveRide(
  userId: string,
  now: Date,
): Promise<{ ride: Ride; driver: Driver | null } | null> {
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('rides')
    .select('id')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES as RideStatus[])
    .order('created_at', { ascending: false })
  if (error) throw error
  let active: { ride: Ride; driver: Driver | null } | null = null
  for (const row of data ?? []) {
    // Przeliczamy każdy — „aktywny” w bazie może być już zakończony wg czasu.
    const r = await advanceRide(row.id as string, userId, now)
    if (!active && isActiveStatus(r.ride.status)) active = r
  }
  return active
}

export async function createRide(userId: string, input: CreateRideInput, now: Date): Promise<Ride> {
  if (await findActiveRide(userId, now)) {
    throw new RideConflictError('Masz już aktywny kurs')
  }
  const distanceKm = estimateDistanceKm(input.pickup, input.dropoff)
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('rides')
    .insert({
      user_id: userId,
      pickup_address: input.pickup.address,
      pickup_lat: input.pickup.lat,
      pickup_lng: input.pickup.lng,
      dropoff_address: input.dropoff.address,
      dropoff_lat: input.dropoff.lat,
      dropoff_lng: input.dropoff.lng,
      class: input.class,
      distance_km: distanceKm,
      price_pln: priceFor(distanceKm, input.class),
      status: 'searching',
      last_notified_status: null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Ride
}

/** Anulowanie: tylko z `searching`/`accepted`, UPDATE warunkowy na starym statusie. */
export async function cancelRide(rideId: string, userId: string, now: Date): Promise<Ride> {
  const admin = createAdminSupabase()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Najpierw przeliczamy — po czasie kurs mógł już ruszyć.
    const { ride } = await advanceRide(rideId, userId, now)
    if (!canCancel(ride.status)) {
      throw new RideConflictError('Tego kursu nie można już anulować')
    }
    const { data, error } = await admin
      .from('rides')
      .update({ status: 'cancelled' })
      .eq('id', ride.id)
      .eq('user_id', userId)
      .eq('status', ride.status)
      .in('status', CANCELLABLE_STATUSES as RideStatus[])
      .select('*')
    if (error) throw error
    if (data && data.length === 1) return maybeNotify(admin, data[0] as Ride, userId)
    // Status zmienił się w międzyczasie — sprawdzamy ponownie.
  }
  throw new RideConflictError('Tego kursu nie można już anulować')
}

export const UNAUTHORIZED = () => Response.json({ error: 'Nie zalogowano' }, { status: 401 })

/** Mapuje błędy serwisu na odpowiedzi HTTP; nieznane → 500 bez szczegółów. */
export function rideErrorResponse(e: unknown): Response {
  if (e instanceof RideNotFoundError) {
    return Response.json({ error: 'Nie znaleziono kursu' }, { status: 404 })
  }
  if (e instanceof RideConflictError) {
    return Response.json({ error: e.message }, { status: 409 })
  }
  console.error('[rides]', e)
  return Response.json({ error: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.' }, { status: 500 })
}
