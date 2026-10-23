'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { STATUS_THRESHOLDS_MS } from '@/lib/ride-status'
import { CLASS_INFO, STATUS_LABEL, formatKm, formatPrice, isTerminal } from '@/lib/ride-ui'
import type { Driver, Ride, RideStatus } from '@/lib/types'
import { PointGlyph } from '@/components/order/PointGlyph'

export interface RideSnapshot {
  ride: Ride
  driver: Driver | null
  progress: number
}

export const POLL_MS = 3_000
/** Zawieszone zapytanie przerywamy, żeby nie blokowało kolejnych. */
export const POLL_TIMEOUT_MS = 8_000

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

/**
 * Stan kursu z `GET /api/rides/[id]` co 3 s. Zatrzymuje się po `completed`/`cancelled`,
 * wstrzymuje przy ukrytej karcie i sprząta interwał przy odmontowaniu.
 */
export function useRidePolling(initial: RideSnapshot | null) {
  const [snapshot, setSnapshot] = useState<RideSnapshot | null>(initial)
  const [offline, setOffline] = useState(false)
  const rideId = snapshot?.ride.id ?? null
  const terminal = snapshot ? isTerminal(snapshot.ride.status) : true
  /** Trwające zapytanie (null = brak); jedno naraz. */
  const inFlight = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!rideId || inFlight.current) return
    const ctrl = new AbortController()
    inFlight.current = ctrl
    const timeout = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/rides/${rideId}`, { cache: 'no-store', signal: ctrl.signal })
      if (!res.ok) throw new Error(String(res.status))
      const next = (await res.json()) as RideSnapshot
      setSnapshot((cur) => {
        // Odpowiedź dla starego kursu (po resecie) ignorujemy.
        if (!cur || cur.ride.id !== next.ride.id) return cur
        // Spóźniona odpowiedź nie cofa zakończonego/anulowanego kursu.
        if (isTerminal(cur.ride.status) && !isTerminal(next.ride.status)) return cur
        return next
      })
      setOffline(false)
    } catch {
      // Przerwanie przy sprzątaniu efektu to nie brak sieci.
      if (inFlight.current === ctrl) setOffline(true)
    } finally {
      clearTimeout(timeout)
      if (inFlight.current === ctrl) inFlight.current = null
    }
  }, [rideId])

  // Zmiana kursu / odmontowanie: przerwij trwające zapytanie i zwolnij blokadę.
  useEffect(
    () => () => {
      inFlight.current?.abort()
      inFlight.current = null
    },
    [rideId],
  )

  useEffect(() => {
    if (!rideId || terminal) return
    const tick = () => {
      if (!document.hidden) void refresh()
    }
    tick()
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [rideId, terminal, refresh])

  return { snapshot, setSnapshot, offline, refresh }
}

// --- widok -----------------------------------------------------------------------------

const STEPS: { status: RideStatus; label: string }[] = [
  { status: 'searching', label: 'Kierowca' },
  { status: 'accepted', label: 'Dojazd' },
  { status: 'in_progress', label: 'Trasa' },
  { status: 'completed', label: 'Na miejscu' },
]

function StatusRail({ status, progress }: { status: RideStatus; progress: number }) {
  const current = STEPS.findIndex((s) => s.status === status)
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapy kursu">
      {STEPS.map((step, i) => {
        const done = i < current || status === 'completed'
        const active = i === current && status !== 'completed'
        const fill = done ? 1 : active ? (step.status === 'in_progress' ? Math.max(0.04, progress) : 0.5) : 0
        return (
          <li key={step.status} aria-current={active ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className="relative h-1.5 overflow-hidden rounded-full bg-border">
              <span
                className={`absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-out ${
                  active && step.status !== 'in_progress' ? 'animate-pulse' : ''
                }`}
                style={{ width: `${fill * 100}%` }}
              />
            </span>
            <span className={`text-xs ${done || active ? 'font-medium text-text' : 'text-muted'}`}>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Tablica rejestracyjna w polskim stylu — z niebieskim paskiem UE. */
function Plate({ plate }: { plate: string }) {
  return (
    <span className="inline-flex h-7 items-stretch overflow-hidden rounded-[5px] border-[1.5px] border-[#1b1f24] bg-white text-[#1b1f24]">
      <span className="flex w-4 flex-col items-center justify-end bg-[#1f4fb5] pb-0.5 text-[7px] font-bold leading-none text-white">
        PL
      </span>
      <span className="flex items-center px-2 font-display text-[13px] font-semibold tracking-wide whitespace-nowrap">
        {plate}
      </span>
    </span>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

const ratingFmt = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function DriverCard({ driver }: { driver: Driver }) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        aria-hidden="true"
        className="grid size-12 self-start shrink-0 place-items-center rounded-full bg-accent/12 font-display text-sm font-semibold text-accent"
      >
        {initials(driver.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{driver.name}</span>
          <span className="shrink-0 text-sm text-muted">
            <span aria-hidden="true" className="text-accent">★</span> {ratingFmt.format(driver.rating)}
            <span className="sr-only"> na 5</span>
          </span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-muted">{driver.car}</span>
          <Plate plate={driver.plate} />
        </p>
      </div>
    </div>
  )
}

function RouteSummary({ ride }: { ride: Ride }) {
  return (
    <ol className="relative flex flex-col gap-3 text-sm">
      <span aria-hidden="true" className="absolute top-4 bottom-4 left-[6px] border-l-2 border-dotted border-border" />
      <li className="relative flex items-start gap-3">
        <PointGlyph kind="start" className="mt-0.5 shrink-0" />
        <span className="sr-only">Odbiór: </span>
        <span className="min-w-0">{ride.pickup_address}</span>
      </li>
      <li className="relative flex items-start gap-3">
        <PointGlyph kind="end" className="mt-0.5 shrink-0" />
        <span className="sr-only">Cel: </span>
        <span className="min-w-0">{ride.dropoff_address}</span>
      </li>
    </ol>
  )
}

function secondsLeft(ride: Ride, now: number): number | null {
  const elapsed = now - new Date(ride.created_at).getTime()
  const target =
    ride.status === 'accepted'
      ? STATUS_THRESHOLDS_MS.in_progress
      : ride.status === 'in_progress'
        ? STATUS_THRESHOLDS_MS.completed
        : null
  if (target === null) return null
  return Math.max(0, Math.ceil((target - elapsed) / 1000))
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `ok. ${Math.max(5, Math.ceil(seconds / 5) * 5)} s`
  return `ok. ${Math.round(seconds / 60)} min`
}

interface ActiveRideProps {
  snapshot: RideSnapshot
  /** Postęp trasy liczony lokalnie (płynny), 0..1. */
  progress: number
  now: number
  offline: boolean
  onCancel: () => void
  cancelling: boolean
  error: string | null
  onReset: () => void
}

export function ActiveRide({ snapshot, progress, now, offline, onCancel, cancelling, error, onReset }: ActiveRideProps) {
  const { ride, driver } = snapshot
  const { status } = ride
  const eta = secondsLeft(ride, now)
  const canCancel = status === 'searching' || status === 'accepted'
  const done = status === 'completed'
  const cancelled = status === 'cancelled'

  const subline =
    status === 'searching'
      ? 'Sprawdzamy, kto jest najbliżej. To potrwa kilka sekund.'
      : status === 'accepted' && eta !== null
        ? `Będzie na miejscu odbioru za ${formatEta(eta)}.`
        : status === 'in_progress' && eta !== null
          ? `Do celu ${formatEta(eta)}. Zapnij pasy.`
          : done
            ? 'Dziękujemy za wspólny przejazd.'
            : 'Możesz od razu zamówić nowy kurs.'

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">{STATUS_LABEL[status]}</h1>
        <p className="text-sm text-muted">{subline}</p>
      </div>

      {!cancelled && <StatusRail status={status} progress={progress} />}

      {done && (
        <div className="flex items-end justify-between gap-4 rounded-control bg-bg px-4 py-3.5">
          <div>
            <p className="text-sm text-muted">Do zapłaty</p>
            <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">{formatPrice(ride.price_pln)}</p>
          </div>
          <p className="pb-1 text-right text-sm text-muted">
            {CLASS_INFO[ride.class].label}
            <br />
            {formatKm(ride.distance_km)}
          </p>
        </div>
      )}

      {driver && !cancelled && (
        <section aria-label="Kierowca" className="border-t border-border pt-5">
          <DriverCard driver={driver} />
        </section>
      )}

      <section aria-label="Trasa" className="flex flex-col gap-4 border-t border-border pt-5">
        <RouteSummary ride={ride} />
        {!done && (
          <p className="flex justify-between text-sm text-muted">
            <span>
              {CLASS_INFO[ride.class].label}, {formatKm(ride.distance_km)}
            </span>
            <span className="font-medium text-text tabular-nums">{formatPrice(ride.price_pln)}</span>
          </p>
        )}
      </section>

      {offline && !isTerminal(status) && (
        <p role="status" className="text-sm text-muted">
          Brak połączenia z serwerem. Ponawiam co kilka sekund…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {canCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="min-h-12 cursor-pointer rounded-control border border-border px-4 font-medium text-danger transition-colors hover:border-danger/60 disabled:cursor-wait disabled:opacity-60"
        >
          {cancelling ? 'Anuluję…' : 'Anuluj kurs'}
        </button>
      )}
      {isTerminal(status) && (
        <button
          type="button"
          onClick={onReset}
          className="min-h-14 cursor-pointer rounded-control bg-accent px-5 font-display text-base font-semibold text-accent-contrast transition-opacity hover:opacity-90"
        >
          Zamów kolejny kurs
        </button>
      )}
    </div>
  )
}

export { readError }
