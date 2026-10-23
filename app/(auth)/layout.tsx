import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { CityMap } from './city-map'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect('/')
  }

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col justify-end overflow-hidden md:flex-row md:items-center md:justify-start md:p-10">
      <CityMap />
      <main className="relative w-full rounded-t-sheet border-t border-border bg-surface px-6 pb-10 pt-7 shadow-sheet sm:px-8 md:max-w-md md:rounded-sheet md:border md:p-10">
        <p className="mb-8 flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className="size-3 rounded-full bg-accent ring-4 ring-accent/20" />
          Eko Taxi
        </p>
        {children}
      </main>
    </div>
  )
}
