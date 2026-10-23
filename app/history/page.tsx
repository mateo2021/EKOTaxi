import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { PointGlyph } from '@/components/order/PointGlyph'
import { getSession } from '@/lib/profile-server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { CLASS_INFO, STATUS_SHORT, formatKm, formatPrice, formatRideDate, ridesCount } from '@/lib/ride-ui'
import type { Driver, Ride, RideStatus } from '@/lib/types'

export const metadata = { title: 'Historia — Eko Taxi' }

type HistoryRide = Ride & { drivers: Pick<Driver, 'name' | 'car' | 'plate'> | null }

const STATUS_TONE: Record<RideStatus, string> = {
  completed: 'bg-accent/12 text-accent',
  cancelled: 'bg-border/60 text-muted',
  searching: 'bg-accent text-accent-contrast',
  accepted: 'bg-accent text-accent-contrast',
  in_progress: 'bg-accent text-accent-contrast',
}

async function loadRides(): Promise<{ rides: HistoryRide[]; failed: boolean }> {
  const supabase = await createServerSupabase()
  // RLS: użytkownik widzi tylko swoje kursy.
  const { data, error } = await supabase
    .from('rides')
    .select('*, drivers(name, car, plate)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    console.error('[history]', error)
    return { rides: [], failed: true }
  }
  return { rides: (data ?? []) as HistoryRide[], failed: false }
}

export default async function HistoryPage() {
  const { userId } = await getSession()
  if (!userId && isSupabaseConfigured()) redirect('/login')
  const { rides, failed } = userId ? await loadRides() : { rides: [], failed: false }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-5 py-8 md:py-12">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Historia kursów</h1>
          {rides.length > 0 && (
            <p className="text-sm text-muted tabular-nums">
              {ridesCount(rides.length)}
            </p>
          )}
        </div>

        {failed ? (
          <p role="alert" className="rounded-control border border-danger/40 p-4 text-danger">
            Nie udało się wczytać historii. Odśwież stronę za chwilę.
          </p>
        ) : rides.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-sheet border border-dashed border-border p-8">
            <p className="font-display text-lg font-semibold">Tu pojawią się Twoje przejazdy</p>
            <p className="text-muted">Nie masz jeszcze żadnego kursu. Wybierz cel na mapie i zamów pierwszy.</p>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center rounded-control bg-accent px-5 font-display font-semibold text-accent-contrast transition-opacity hover:opacity-90"
            >
              Zamów kurs
            </Link>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {rides.map((ride) => (
              <li key={ride.id} className="rounded-sheet border border-border bg-surface p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <time dateTime={ride.created_at} className="text-sm text-muted">
                    {formatRideDate(ride.created_at)}
                  </time>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[ride.status]}`}>
                    {STATUS_SHORT[ride.status]}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-5">
                  <ol className="relative flex min-w-0 flex-col gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className="absolute top-4 bottom-4 left-[6px] border-l-2 border-dotted border-border"
                    />
                    <li className="relative flex items-start gap-3">
                      <PointGlyph kind="start" className="mt-0.5 shrink-0" />
                      <span className="sr-only">Odbiór: </span>
                      <span className="min-w-0 break-words">{ride.pickup_address}</span>
                    </li>
                    <li className="relative flex items-start gap-3">
                      <PointGlyph kind="end" className="mt-0.5 shrink-0" />
                      <span className="sr-only">Cel: </span>
                      <span className="min-w-0 break-words">{ride.dropoff_address}</span>
                    </li>
                  </ol>
                  <p
                    className={`shrink-0 font-display text-lg font-semibold tabular-nums ${
                      ride.status === 'cancelled' ? 'text-muted line-through decoration-1' : ''
                    }`}
                  >
                    {formatPrice(ride.price_pln)}
                  </p>
                </div>

                <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
                  {CLASS_INFO[ride.class].label}, {formatKm(ride.distance_km)}
                  {ride.drivers && (
                    <>
                      <br className="sm:hidden" />
                      <span className="hidden sm:inline">. </span>
                      Kierowca: {ride.drivers.name}, {ride.drivers.car}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </main>
    </AppShell>
  )
}
