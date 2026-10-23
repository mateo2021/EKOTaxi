import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSession } from '@/lib/profile-server'
import { SettingsForm } from './settings-form'

export const metadata = { title: 'Ustawienia — Eko Taxi' }

export default async function SettingsPage() {
  const { userId, profile } = await getSession()
  // Do /login tylko bez sesji; z sesją, ale bez profilu, (auth) odsyłałoby z powrotem.
  if (!userId && isSupabaseConfigured()) redirect('/login')

  const notice = !isSupabaseConfigured()
    ? 'Ustawienia będą dostępne po skonfigurowaniu Supabase i zalogowaniu.'
    : 'Nie znaleziono Twojego profilu. Wyloguj się i zaloguj ponownie albo skontaktuj się z administratorem.'

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-xl px-5 py-8 md:py-12">
        <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">Ustawienia</h1>
        {profile ? (
          <SettingsForm profile={profile} />
        ) : (
          <p className="rounded-control border border-border bg-surface p-4 text-muted">{notice}</p>
        )}
      </main>
    </AppShell>
  )
}
