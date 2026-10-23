import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { PromoForm } from '@/components/PromoForm'
import { getSession } from '@/lib/profile-server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { formatRideDate } from '@/lib/ride-ui'
import type { Promo } from '@/lib/types'

export const metadata = { title: 'Promocje — Eko Taxi' }

async function loadPromos(): Promise<{ promos: Promo[]; failed: boolean }> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('promos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    console.error('[promos]', error)
    return { promos: [], failed: true }
  }
  return { promos: (data ?? []) as Promo[], failed: false }
}

function Leaf() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14Z" />
      <path d="M5 19c3-4 6-7 10-9" />
    </svg>
  )
}

export default async function PromosPage() {
  const { userId, profile } = await getSession()
  if (!userId && isSupabaseConfigured()) redirect('/login')
  const { promos, failed } = userId ? await loadPromos() : { promos: [], failed: false }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-5 py-8 md:py-12">
        <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">Promocje</h1>

        {profile?.is_admin && <PromoForm />}

        {failed ? (
          <p role="alert" className="rounded-control border border-danger/40 p-4 text-danger">
            Nie udało się wczytać promocji. Odśwież stronę za chwilę.
          </p>
        ) : promos.length === 0 ? (
          <div className="rounded-sheet border border-dashed border-border p-8">
            <p className="font-display text-lg font-semibold">Na razie bez promocji</p>
            <p className="mt-2 text-muted">Gdy pojawi się nowa oferta, zobaczysz ją tutaj.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {promos.map((p) => (
              <li key={p.id} className="flex gap-4 rounded-sheet border border-border bg-surface p-5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                  <Leaf />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold break-words">{p.title}</h2>
                  <p className="mt-2 whitespace-pre-line break-words text-muted">{p.body}</p>
                  <time dateTime={p.created_at} className="mt-3 block text-sm text-muted">
                    {formatRideDate(p.created_at)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  )
}
