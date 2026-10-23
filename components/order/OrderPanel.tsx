'use client'

import { estimateDistanceKm, priceFor } from '@/lib/pricing'
import { formatKm, formatPrice } from '@/lib/ride-ui'
import type { GeoPlace } from '@/lib/nominatim'
import type { RideClass } from '@/lib/types'
import { AddressInput } from './AddressInput'
import type { PointKind } from './PointGlyph'
import { ClassPicker } from './ClassPicker'

interface OrderPanelProps {
  pickup: GeoPlace | null
  dropoff: GeoPlace | null
  onPickup: (p: GeoPlace | null) => void
  onDropoff: (p: GeoPlace | null) => void
  onSwap: () => void
  /** Które pole ustawi kliknięcie w mapę. */
  target: PointKind
  onTarget: (kind: PointKind) => void
  resolving: PointKind | null
  rideClass: RideClass
  onClass: (cls: RideClass) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

export function OrderPanel({
  pickup,
  dropoff,
  onPickup,
  onDropoff,
  onSwap,
  target,
  onTarget,
  resolving,
  rideClass,
  onClass,
  onSubmit,
  submitting,
  error,
}: OrderPanelProps) {
  const distanceKm = pickup && dropoff ? estimateDistanceKm(pickup, dropoff) : null
  const samePoint = distanceKm !== null && distanceKm < 0.1
  const ready = pickup !== null && dropoff !== null && !samePoint && resolving === null
  const price = distanceKm !== null ? priceFor(distanceKm, rideClass) : null

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !submitting) onSubmit()
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dokąd jedziemy?</h1>
        <p className="text-sm text-muted">
          Wpisz adres albo kliknij na mapie — ustawisz {target === 'start' ? 'miejsce odbioru' : 'cel podróży'}.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <AddressInput
            kind="start"
            label="Skąd"
            placeholder="Ulica i numer, miasto"
            value={pickup}
            onChange={onPickup}
            targeted={target === 'start'}
            onTarget={() => onTarget('start')}
            resolving={resolving === 'start'}
          />
          <AddressInput
            kind="end"
            label="Dokąd"
            placeholder="Dokąd jedziesz?"
            value={dropoff}
            onChange={onDropoff}
            targeted={target === 'end'}
            onTarget={() => onTarget('end')}
            resolving={resolving === 'end'}
          />
        </div>
        {(pickup || dropoff) && (
          <button
            type="button"
            onClick={onSwap}
            aria-label="Zamień odbiór i cel"
            title="Zamień odbiór i cel"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:text-text"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2.5v11M2.5 5 5 2.5 7.5 5M11 13.5v-11M8.5 11l2.5 2.5 2.5-2.5" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-baseline justify-between px-1 text-sm">
          <span className="font-medium">Klasa przejazdu</span>
          <span className="text-muted">
            {distanceKm !== null ? `Trasa ok. ${formatKm(distanceKm)}` : 'Cena po wybraniu trasy'}
          </span>
        </p>
        <ClassPicker value={rideClass} onChange={onClass} distanceKm={distanceKm} />
      </div>

      {samePoint && (
        <p role="alert" className="text-sm text-danger">
          Odbiór i cel to prawie to samo miejsce. Wybierz inny cel.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || submitting}
        className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-control bg-accent px-5 font-display text-base font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span>{submitting ? 'Zamawiam…' : 'Zamów Eko Taxi'}</span>
        {price !== null && <span className="tabular-nums">{formatPrice(price)}</span>}
      </button>
    </form>
  )
}
