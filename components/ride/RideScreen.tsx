'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { reverseGeocode, type GeoPlace } from '@/lib/nominatim'
import { progressFraction } from '@/lib/ride-status'
import { isTerminal } from '@/lib/ride-ui'
import type { Ride, RideClass } from '@/lib/types'
import { OrderPanel } from '@/components/order/OrderPanel'
import type { PointKind } from '@/components/order/PointGlyph'
import type { Point } from '@/components/map/RideMap'
import { ActiveRide, readError, useRidePolling } from './ActiveRide'

// Leaflet potrzebuje `window` — mapa tylko po stronie klienta.
const RideMap = dynamic(() => import('@/components/map/RideMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-bg" />,
})

/** Co ile odświeżamy pozycję auta i odliczanie (lokalnie, bez zapytań). */
const TICK_MS = 400

const NETWORK_ERROR = 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
const SESSION_ERROR = 'Sesja wygasła. Zaloguj się ponownie.'

export function RideScreen({ defaultClass }: { defaultClass: RideClass }) {
  const [checking, setChecking] = useState(true)
  const [pickup, setPickup] = useState<GeoPlace | null>(null)
  const [dropoff, setDropoff] = useState<GeoPlace | null>(null)
  const [target, setTarget] = useState<PointKind>('start')
  const [resolving, setResolving] = useState<PointKind | null>(null)
  const [rideClass, setRideClass] = useState<RideClass>(defaultClass)
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [rideError, setRideError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const geoAbort = useRef<AbortController | null>(null)

  const { snapshot, setSnapshot, offline, refresh } = useRidePolling(null)
  const ride = snapshot?.ride ?? null
  const live = ride !== null && !isTerminal(ride.status)

  const showRide = useCallback(
    (r: Ride) => setSnapshot((cur) => (cur && cur.ride.id === r.id ? { ...cur, ride: r } : { ride: r, driver: null, progress: 0 })),
    [setSnapshot],
  )

  // Wejście na „/”: przywróć trwający kurs, jeśli jest.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/rides/active', { cache: 'no-store', signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) return
        const body = (await res.json()) as { ride: Ride | null }
        if (body.ride) showRide(body.ride)
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setChecking(false)
      })
    return () => ctrl.abort()
  }, [showRide])

  // Zegar dla płynnej jazdy auta i odliczania — tylko w trakcie kursu.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [live])

  useEffect(() => () => geoAbort.current?.abort(), [])

  const pick = useCallback(
    async (point: Point) => {
      const kind = target
      geoAbort.current?.abort()
      const ctrl = new AbortController()
      geoAbort.current = ctrl
      setResolving(kind)
      setOrderError(null)
      try {
        const address = await reverseGeocode(point.lat, point.lng, ctrl.signal)
        const place = { address, lat: point.lat, lng: point.lng }
        if (kind === 'start') {
          setPickup(place)
          if (!dropoff) setTarget('end')
        } else {
          setDropoff(place)
          if (!pickup) setTarget('start')
        }
      } catch {
        // przerwane nowszym kliknięciem
      } finally {
        if (geoAbort.current === ctrl) setResolving(null)
      }
    },
    [target, pickup, dropoff],
  )

  function choosePickup(p: GeoPlace | null) {
    setPickup(p)
    setOrderError(null)
    if (p && !dropoff) setTarget('end')
  }

  function chooseDropoff(p: GeoPlace | null) {
    setDropoff(p)
    setOrderError(null)
  }

  async function order() {
    if (!pickup || !dropoff) return
    setSubmitting(true)
    setOrderError(null)
    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup, dropoff, class: rideClass }),
      })
      if (res.status === 201) {
        const { ride: created } = (await res.json()) as { ride: Ride }
        setRideError(null)
        setNow(Date.now())
        showRide(created)
        return
      }
      if (res.status === 401) {
        setOrderError(SESSION_ERROR)
        return
      }
      setOrderError(await readError(res, 'Nie udało się zamówić kursu. Spróbuj ponownie.'))
      if (res.status === 409) {
        // Już jest aktywny kurs (np. z innej karty) — pokaż go.
        const active = await fetch('/api/rides/active', { cache: 'no-store' })
        if (active.ok) {
          const body = (await active.json()) as { ride: Ride | null }
          if (body.ride) {
            setOrderError(null)
            showRide(body.ride)
          }
        }
      }
    } catch {
      setOrderError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel() {
    if (!ride) return
    setCancelling(true)
    setRideError(null)
    try {
      const res = await fetch(`/api/rides/${ride.id}/cancel`, { method: 'POST' })
      if (res.ok) {
        const body = (await res.json()) as { ride: Ride }
        showRide(body.ride)
      } else {
        setRideError(
          res.status === 401 ? SESSION_ERROR : await readError(res, 'Nie udało się anulować kursu.'),
        )
        void refresh()
      }
    } catch {
      setRideError(NETWORK_ERROR)
    } finally {
      setCancelling(false)
    }
  }

  function reset() {
    setSnapshot(null)
    setPickup(null)
    setDropoff(null)
    setTarget('start')
    setRideError(null)
    setOrderError(null)
  }

  // Co pokazać na mapie.
  let mapPickup: Point | null = pickup
  let mapDropoff: Point | null = dropoff
  let carAt: number | null = null
  let progress = 0
  if (ride) {
    mapPickup = { lat: ride.pickup_lat, lng: ride.pickup_lng }
    mapDropoff = { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
    progress =
      ride.status === 'completed'
        ? 1
        : ride.status === 'in_progress'
          ? Math.max(snapshot?.progress ?? 0, progressFraction(new Date(ride.created_at), new Date(now)))
          : 0
    if (ride.status === 'accepted' || ride.status === 'in_progress' || ride.status === 'completed') {
      carAt = progress
    }
  }

  return (
    <div className="relative isolate -mb-20 min-h-[32rem] flex-1 md:mb-0">
      <div className="absolute inset-0 z-0">
        <RideMap
          pickup={mapPickup}
          dropoff={mapDropoff}
          carAt={carAt}
          searching={ride?.status === 'searching'}
          onPick={ride || checking ? undefined : pick}
        />
      </div>

      <section
        aria-label={ride ? 'Twój kurs' : 'Zamówienie'}
        className="absolute inset-x-0 bottom-0 z-10 max-h-[64dvh] overflow-y-auto overscroll-contain rounded-t-sheet border-t border-border bg-surface px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-sheet sm:px-7 md:top-5 md:bottom-auto md:left-5 md:max-h-[calc(100%-2.5rem)] md:w-[420px] md:rounded-sheet md:border md:p-7"
      >
        {checking ? (
          <div className="flex flex-col gap-3" role="status">
            <div className="h-7 w-2/3 animate-pulse rounded-control bg-bg" />
            <div className="h-12 animate-pulse rounded-control bg-bg" />
            <div className="h-12 animate-pulse rounded-control bg-bg" />
            <span className="sr-only">Sprawdzam, czy masz trwający kurs…</span>
          </div>
        ) : snapshot ? (
          <ActiveRide
            snapshot={snapshot}
            progress={progress}
            now={now}
            offline={offline}
            onCancel={cancel}
            cancelling={cancelling}
            error={rideError}
            onReset={reset}
          />
        ) : (
          <OrderPanel
            pickup={pickup}
            dropoff={dropoff}
            onPickup={choosePickup}
            onDropoff={chooseDropoff}
            onSwap={() => {
              setPickup(dropoff)
              setDropoff(pickup)
            }}
            target={target}
            onTarget={setTarget}
            resolving={resolving}
            rideClass={rideClass}
            onClass={setRideClass}
            onSubmit={order}
            submitting={submitting}
            error={orderError}
          />
        )}
      </section>
    </div>
  )
}
