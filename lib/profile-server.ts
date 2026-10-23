import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import type { Profile } from '@/lib/types'

export interface Session {
  userId: string | null
  profile: Profile | null
}

const loadSession = cache(async (): Promise<Session> => {
  if (!isSupabaseConfigured()) return { userId: null, profile: null }
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { userId: null, profile: null }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    return { userId: user.id, profile: (data as Profile | null) ?? null }
  } catch {
    return { userId: null, profile: null }
  }
})

/** Użytkownik i jego profil (profil może nie istnieć mimo sesji). */
export async function getSession(): Promise<Session> {
  return loadSession()
}

/** Profil zalogowanego użytkownika albo null (niezalogowany / brak Supabase / brak wiersza). */
export async function getProfile(): Promise<Profile | null> {
  return (await loadSession()).profile
}
