/**
 * Geokodowanie przez Nominatim (OpenStreetMap). Polityka usługi: najwyżej 1 zapytanie/s —
 * wywołujący odpowiada za debounce (500 ms) i przerywanie poprzednich zapytań (AbortSignal).
 * Przeglądarka nie pozwala ustawić User-Agent, więc podajemy `accept-language=pl`.
 */

export interface GeoPlace {
  /** Krótki adres do pola i do zapisu w kursie (≤ 200 znaków). */
  address: string
  lat: number
  lng: number
  /** Dalsza część pełnej nazwy (dzielnica, miasto…) — tylko do podpowiedzi. */
  context?: string
}

const BASE = 'https://nominatim.openstreetmap.org'
export const MIN_QUERY_LENGTH = 3
const MAX_ADDRESS = 200

type Fetch = typeof fetch

/** Najmniejszy odstęp między startami zapytań do Nominatim (polityka: max 1 req/s). */
export const MIN_INTERVAL_MS = 1000

export interface RateGate {
  /** Czeka na swoją kolej (kolejka, nic nie jest odrzucane); odrzuca po abort. */
  wait(signal?: AbortSignal): Promise<void>
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('Aborted', 'AbortError')
}

/**
 * Bramka rezerwująca kolejne „okna” co `intervalMs`. Każde wywołanie dostaje najbliższe
 * wolne okno i czeka do niego. Przerwane czekanie zwalnia okno, jeśli było ostatnie.
 */
export function createRateGate(intervalMs = MIN_INTERVAL_MS): RateGate {
  let next = 0
  return {
    wait(signal) {
      if (signal?.aborted) return Promise.reject(abortReason(signal))
      const now = Date.now()
      const start = Math.max(now, next)
      const prev = next
      next = start + intervalMs
      const delay = start - now
      if (delay <= 0) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          if (next === start + intervalMs) next = prev
          reject(abortReason(signal))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, delay)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
  }
}

/** Wspólna bramka dla wyszukiwania i odwrotnego geokodowania w całej karcie. */
const sharedGate = createRateGate()

interface NominatimAddress {
  road?: string
  pedestrian?: string
  house_number?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  suburb?: string
}

interface NominatimItem {
  display_name?: unknown
  lat?: unknown
  lon?: unknown
  name?: unknown
  address?: NominatimAddress
}

function clip(s: string): string {
  return s.length > MAX_ADDRESS ? `${s.slice(0, MAX_ADDRESS - 1)}…` : s
}

/** Pierwsze `parts` części `display_name` (po przecinkach). */
export function shortenDisplayName(displayName: string, parts = 3): string {
  return clip(
    displayName
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, parts)
      .join(', '),
  )
}

/** „Marszałkowska 10, Warszawa” ze szczegółów adresu; null, gdy brak ulicy i nazwy. */
function fromDetails(item: NominatimItem): string | null {
  const a = item.address
  if (!a) return null
  const road = a.road ?? a.pedestrian
  const street = road ? [road, a.house_number].filter(Boolean).join(' ') : null
  const name = typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : null
  const primary = name && name !== road ? name : street
  if (!primary) return null
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null
  const parts = [primary]
  if (name && name !== road && street) parts.push(street)
  if (city && city !== primary) parts.push(city)
  return clip(parts.join(', '))
}

/** Jeden wynik Nominatim → GeoPlace albo null (brak nazwy / złe współrzędne). */
export function toGeoPlace(item: NominatimItem): GeoPlace | null {
  if (typeof item.display_name !== 'string' || item.display_name.trim() === '') return null
  const lat = Number(item.lat)
  const lng = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const address = fromDetails(item) ?? shortenDisplayName(item.display_name)
  const rest = item.display_name
    .split(',')
    .map((p) => p.trim())
    .slice(1, 4)
    .join(', ')
  return { address, lat, lng, context: rest || undefined }
}

/** Odpowiedź `/search` → lista miejsc (pomija niepoprawne wpisy). */
export function mapSearchResults(json: unknown): GeoPlace[] {
  if (!Array.isArray(json)) return []
  const seen = new Set<string>()
  return json.flatMap((item) => {
    const place = typeof item === 'object' && item !== null ? toGeoPlace(item as NominatimItem) : null
    if (!place) return []
    // Odcinki tej samej ulicy mają ten sam krótki adres — pokazujemy jeden (pierwszy, najlepszy).
    const key = place.address.toLocaleLowerCase('pl')
    if (seen.has(key)) return []
    seen.add(key)
    return [place]
  })
}

export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/** Szuka adresów w Polsce. Krótsze niż 3 znaki → pusta lista bez zapytania. */
export async function searchAddress(
  q: string,
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
  gate: RateGate = sharedGate,
): Promise<GeoPlace[]> {
  const query = q.trim()
  if (query.length < MIN_QUERY_LENGTH) return []
  const params = new URLSearchParams({
    format: 'json',
    countrycodes: 'pl',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'pl',
    q: query,
  })
  await gate.wait(signal)
  const res = await fetchImpl(`${BASE}/search?${params}`, { signal })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  return mapSearchResults(await res.json())
}

/** Adres dla punktu na mapie; przy błędzie — współrzędne „lat, lng”. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
  gate: RateGate = sharedGate,
): Promise<string> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'pl',
  })
  try {
    await gate.wait(signal)
    const res = await fetchImpl(`${BASE}/reverse?${params}`, { signal })
    if (!res.ok) return formatLatLng(lat, lng)
    const place = toGeoPlace((await res.json()) as NominatimItem)
    return place?.address ?? formatLatLng(lat, lng)
  } catch (e) {
    if (signal?.aborted) throw e
    return formatLatLng(lat, lng)
  }
}
