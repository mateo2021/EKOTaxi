import type { RideClass, RideStatus } from '@/lib/types'

/** Polskie etykiety i formatowanie wspólne dla ekranu mapy i historii (czyste, bez Reacta). */

export const STATUS_LABEL: Record<RideStatus, string> = {
  searching: 'Szukamy kierowcy…',
  accepted: 'Kierowca jedzie po Ciebie',
  in_progress: 'W trasie',
  completed: 'Dojechałeś!',
  cancelled: 'Kurs anulowany',
}

/** Krótkie etykiety statusu do listy historii. */
export const STATUS_SHORT: Record<RideStatus, string> = {
  searching: 'Szukanie kierowcy',
  accepted: 'Kierowca w drodze',
  in_progress: 'W trasie',
  completed: 'Zakończony',
  cancelled: 'Anulowany',
}

/** Kolejność klas w interfejsie (bez importu lib/profile, który ciągnie lib/discord). */
export const CLASS_ORDER: readonly RideClass[] = ['economy', 'comfort', 'xl']

export const CLASS_INFO: Record<RideClass, { label: string; hint: string }> = {
  economy: { label: 'Ekonomiczna', hint: 'Do 4 osób, najtaniej' },
  comfort: { label: 'Komfort', hint: 'Nowsze auto, więcej miejsca' },
  xl: { label: 'XL', hint: 'Do 6 osób i bagaż' },
}

const pln = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPrice(value: number): string {
  return pln.format(value)
}

const km = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 })

export function formatKm(value: number): string {
  return `${km.format(value)} km`
}

const dateFmt = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
})

export function formatRideDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function isTerminal(status: RideStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** Punkt na odcinku a→b w ułamku t (0..1). Linia prosta — wystarcza na mapie. */
export function lerpPoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number,
): { lat: number; lng: number } {
  const f = Math.min(1, Math.max(0, t))
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

/** Kierunek a→b w stopniach (0 = północ, zgodnie z ruchem wskazówek). */
export function headingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180)
  const dy = b.lat - a.lat
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dx, dy) * 180) / Math.PI
}

/** „1 kurs”, „3 kursy”, „5 kursów”. */
export function ridesCount(n: number): string {
  const d = n % 10
  const t = n % 100
  if (n === 1) return '1 kurs'
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return `${n} kursy`
  return `${n} kursów`
}
