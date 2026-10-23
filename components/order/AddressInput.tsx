'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { PointGlyph, type PointKind } from './PointGlyph'
import { MIN_QUERY_LENGTH, searchAddress, type GeoPlace } from '@/lib/nominatim'

/** Odstęp od ostatniego naciśnięcia klawisza do zapytania (polityka Nominatim: ≤ 1 req/s). */
const DEBOUNCE_MS = 500

interface AddressInputProps {
  kind: PointKind
  label: string
  placeholder: string
  value: GeoPlace | null
  onChange: (place: GeoPlace | null) => void
  /** To pole ustawi kliknięcie w mapę. */
  targeted: boolean
  onTarget: () => void
  /** Adres jest właśnie ustalany z kliknięcia w mapę. */
  resolving?: boolean
}

type SearchState = 'idle' | 'loading' | 'done' | 'error'

export function AddressInput({
  kind,
  label,
  placeholder,
  value,
  onChange,
  targeted,
  onTarget,
  resolving = false,
}: AddressInputProps) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState(value?.address ?? '')
  const [syncedValue, setSyncedValue] = useState(value)
  const [query, setQuery] = useState<string | null>(null)
  const [results, setResults] = useState<GeoPlace[]>([])
  const [state, setState] = useState<SearchState>('idle')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wartość ustawiona z zewnątrz (klik w mapę, reset) → pokaż jej adres w polu.
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (value) {
      setText(value.address)
      setQuery(null)
      setOpen(false)
    } else if (syncedValue && text === syncedValue.address) {
      setText('')
    }
  }

  useEffect(() => {
    if (query === null || query.trim().length < MIN_QUERY_LENGTH) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setState('loading')
      try {
        const found = await searchAddress(query, ctrl.signal)
        setResults(found)
        setHighlight(found.length > 0 ? 0 : -1)
        setState('done')
      } catch {
        if (!ctrl.signal.aborted) {
          setResults([])
          setState('error')
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
  }, [])

  function choose(place: GeoPlace) {
    setText(place.address)
    setQuery(null)
    setOpen(false)
    setResults([])
    setState('idle')
    onChange(place)
  }

  function onType(next: string) {
    setText(next)
    setQuery(next)
    setOpen(true)
    if (next.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setState('idle')
    }
    if (value) onChange(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      choose(results[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const tooShort = text.trim().length < MIN_QUERY_LENGTH
  const showList = open && query !== null && !tooShort && state !== 'idle'

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={`flex items-center gap-3 rounded-control border bg-bg px-4 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${
          targeted ? 'border-accent/60' : 'border-border'
        }`}
      >
        <PointGlyph kind={kind} className="shrink-0" />
        <span className="w-14 shrink-0 text-sm font-medium text-muted">{label}</span>
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={resolving ? 'Ustalam adres…' : text}
          readOnly={resolving}
          placeholder={placeholder}
          onChange={(e) => onType(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            onTarget()
            if (query !== null) setOpen(true)
          }}
          onBlur={() => {
            // Opóźnienie, by kliknięcie podpowiedzi zdążyło się wykonać.
            blurTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          className={`min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-muted/70 focus-visible:outline-none ${
            resolving ? 'text-muted' : 'text-text'
          }`}
        />
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Podpowiedzi: ${label}`}
          className="mt-1.5 overflow-hidden rounded-control border border-border bg-surface py-1"
        >
          {state === 'loading' && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">Szukam…</li>
          )}
          {state === 'error' && (
            <li className="px-4 py-3 text-sm text-danger">
              Wyszukiwarka adresów nie odpowiada. Spróbuj za chwilę albo kliknij na mapie.
            </li>
          )}
          {state === 'done' && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">
              Nie znaleziono takiego adresu. Dopisz miasto albo kliknij na mapie.
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lng},${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-4 py-2.5 ${i === highlight ? 'bg-accent/10' : ''}`}
            >
              <span className="block truncate text-sm font-medium">{r.address}</span>
              {r.context && <span className="block truncate text-xs text-muted">{r.context}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
