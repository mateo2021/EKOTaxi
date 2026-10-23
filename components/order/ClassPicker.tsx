'use client'

import { priceFor } from '@/lib/pricing'
import { CLASS_INFO, CLASS_ORDER, formatPrice } from '@/lib/ride-ui'
import type { RideClass } from '@/lib/types'

interface ClassPickerProps {
  value: RideClass
  onChange: (cls: RideClass) => void
  /** Szacowany dystans; null = trasa jeszcze nieznana. */
  distanceKm: number | null
}

/** Sylwetki aut rosną z klasą — szybkie rozróżnienie bez czytania. */
function ClassCar({ cls }: { cls: RideClass }) {
  const w = cls === 'xl' ? 44 : cls === 'comfort' ? 40 : 36
  return (
    <svg viewBox="0 0 44 20" width={w} height={18} aria-hidden="true" className="shrink-0">
      {cls === 'xl' ? (
        <path d="M2 14V7c0-1.7 1.3-3 3-3h24c1.2 0 2.3.7 2.8 1.8L34 10h5c1.7 0 3 1.3 3 3v1z" className="fill-current" />
      ) : cls === 'comfort' ? (
        <path d="M2 14v-3c0-1.4 1-2.6 2.4-2.9L10 7l4.6-3.4c.9-.7 2-1.1 3.1-1.1h8c1.3 0 2.5.6 3.3 1.6L32 7l6.3 1.3C40.4 8.7 42 10.6 42 12.8V14z" className="fill-current" />
      ) : (
        <path d="M3 14v-3c0-1.5 1.1-2.7 2.5-3L10 7l4-3.5c.7-.6 1.6-1 2.6-1H24c1.1 0 2.1.5 2.8 1.3L30 7l4.5 1c1.5.3 2.5 1.6 2.5 3.1V14z" className="fill-current" />
      )}
      <circle cx="11" cy="15" r="3.6" className="fill-surface stroke-current" strokeWidth={2.2} />
      <circle cx={cls === 'xl' ? 34 : cls === 'comfort' ? 33 : 29} cy="15" r="3.6" className="fill-surface stroke-current" strokeWidth={2.2} />
    </svg>
  )
}

export function ClassPicker({ value, onChange, distanceKm }: ClassPickerProps) {
  return (
    <fieldset>
      <legend className="sr-only">Klasa przejazdu</legend>
      {/* Telefon: trzy kafelki obok siebie (arkusz musi zmieścić przycisk); szerzej: lista. */}
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-col">
        {CLASS_ORDER.map((cls) => {
          const info = CLASS_INFO[cls]
          const price = distanceKm !== null ? formatPrice(priceFor(distanceKm, cls)) : null
          return (
            <label
              key={cls}
              className="group flex min-h-14 cursor-pointer flex-col items-center gap-1 rounded-control border border-border px-2 py-2.5 text-center sm:flex-row sm:gap-3.5 sm:border-transparent sm:px-3.5 sm:text-left text-muted transition-colors hover:bg-bg has-[:checked]:border-accent has-[:checked]:bg-accent/8 has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="ride-class"
                value={cls}
                checked={value === cls}
                onChange={() => onChange(cls)}
                className="sr-only"
              />
              <span className="flex justify-center sm:w-12">
                <ClassCar cls={cls} />
              </span>
              <span className="min-w-0 sm:flex-1">
                <span className="block font-medium text-text">{info.label}</span>
                <span className="hidden truncate text-xs text-muted sm:block">{info.hint}</span>
              </span>
              <span className="tabular-nums sm:text-right">
                {price ? (
                  <span className="font-display text-base font-semibold text-text">{price}</span>
                ) : (
                  <span className="text-sm text-muted">—</span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
