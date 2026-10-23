'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import {
  AttributionControl,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { headingDeg, lerpPoint } from '@/lib/ride-ui'

export type Point = { lat: number; lng: number }

export interface RideMapProps {
  pickup: Point | null
  dropoff: Point | null
  /** Ułamek trasy (0..1), na którym stoi auto; null = bez auta. */
  carAt: number | null
  /** Pulsujący punkt odbioru (szukanie kierowcy). */
  searching?: boolean
  /** Kliknięcie w mapę (ustawianie punktu); brak = mapa tylko do podglądu. */
  onPick?: (point: Point) => void
}

/** Warszawa, Śródmieście. */
const DEFAULT_CENTER: [number, number] = [52.2297, 21.0122]

/** Jedne kafelki OSM dla obu motywów — ciemny robi filtr CSS w globals.css. */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'

// --- znaczniki (divIcon: własny HTML zamiast obrazków Leafleta) -------------------------

const pickupIcon = (searching: boolean) =>
  L.divIcon({
    className: 'eko-marker',
    html: `<span class="eko-pin-start${searching ? ' is-searching' : ''}"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

const dropoffIcon = L.divIcon({
  className: 'eko-marker',
  html: '<span class="eko-pin-end"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

const carIcon = (heading: number) =>
  L.divIcon({
    className: 'eko-marker',
    html: `<span class="eko-car" style="transform: rotate(${heading.toFixed(1)}deg)">
      <svg viewBox="0 0 24 40" width="20" height="33" aria-hidden="true">
        <rect x="2" y="1.5" width="20" height="37" rx="8" class="eko-car-body"/>
        <rect x="5" y="10" width="14" height="7" rx="2.5" class="eko-car-glass"/>
        <rect x="5.5" y="28" width="13" height="5" rx="2" class="eko-car-glass"/>
        <rect x="4" y="3.5" width="4" height="2" rx="1" class="eko-car-light"/>
        <rect x="16" y="3.5" width="4" height="2" rx="1" class="eko-car-light"/>
      </svg>
    </span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })

// --- zachowania mapy -------------------------------------------------------------------

function ClickToPick({ onPick }: { onPick?: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/** Dopasowuje widok do punktów, zostawiając miejsce na panel (lewy na desktopie, dolny na telefonie). */
function FitToPoints({ points }: { points: Point[] }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  useEffect(() => {
    if (points.length === 0) return
    const size = map.getSize()
    const desktop = size.x >= 768
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.flyToBounds(bounds, {
      paddingTopLeft: desktop ? [470, 80] : [40, 70],
      paddingBottomRight: desktop ? [80, 80] : [40, Math.round(size.y * 0.55)],
      maxZoom: 16,
      duration: 0.8,
    })
    // `key` opisuje punkty — nie reagujemy na nową tablicę o tych samych współrzędnych.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

export default function RideMap({ pickup, dropoff, carAt, searching = false, onPick }: RideMapProps) {
  const points = [pickup, dropoff].filter((p): p is Point => p !== null)
  const route = pickup && dropoff ? ([pickup, dropoff] as const) : null
  const car = route && carAt !== null ? lerpPoint(route[0], route[1], carAt) : null
  const heading = route ? headingDeg(route[0], route[1]) : 0

  const startIcon = useMemo(() => pickupIcon(searching), [searching])
  const vehicleIcon = useMemo(() => carIcon(heading), [heading])

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={12}
      zoomControl={false}
      attributionControl={false}
      className={`eko-map h-full w-full ${onPick ? 'is-picking' : ''}`}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <AttributionControl position="topright" prefix={false} />
      <ZoomControl position="bottomright" />
      <ClickToPick onPick={onPick} />
      <FitToPoints points={points} />

      {route && (
        <>
          <Polyline positions={[route[0], route[1]]} pathOptions={{ className: 'eko-route-casing', weight: 10 }} />
          {car && carAt !== null && carAt > 0 ? (
            <>
              <Polyline
                positions={[route[0], car]}
                pathOptions={{ className: 'eko-route-done', weight: 5, dashArray: '2 9' }}
              />
              <Polyline positions={[car, route[1]]} pathOptions={{ className: 'eko-route', weight: 5 }} />
            </>
          ) : (
            <Polyline positions={[route[0], route[1]]} pathOptions={{ className: 'eko-route', weight: 5 }} />
          )}
        </>
      )}

      {pickup && <Marker position={pickup} icon={startIcon} keyboard={false} title="Odbiór" />}
      {dropoff && <Marker position={dropoff} icon={dropoffIcon} keyboard={false} title="Cel" />}
      {car && <Marker position={car} icon={vehicleIcon} keyboard={false} title="Twoje Eko Taxi" zIndexOffset={500} />}
    </MapContainer>
  )
}
