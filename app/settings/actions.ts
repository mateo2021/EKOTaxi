'use server'

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { resolveWebhook, sendDiscord } from '@/lib/discord'
import { parseProfileForm, parseWebhook } from '@/lib/profile'
import type { Profile } from '@/lib/types'

export type SettingsState = { error: string | null; message: string | null }

const NOT_LOGGED_IN = 'Zaloguj się, aby zmienić ustawienia'
const MISSING_CONFIG = 'Brak konfiguracji Supabase'

const loadProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    return (data as Profile | null) ?? null
  } catch {
    return null
  }
})

/** Profil zalogowanego użytkownika albo null (niezalogowany / brak Supabase). */
export async function getProfile(): Promise<Profile | null> {
  return loadProfile()
}

export async function updateProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = parseProfileForm(formData)
  if (!parsed.ok) return { error: parsed.error, message: null }
  if (!isSupabaseConfigured()) return { error: MISSING_CONFIG, message: null }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_LOGGED_IN, message: null }

  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id)
  if (error) return { error: 'Nie udało się zapisać ustawień', message: null }

  // Odświeża layout, więc <html data-theme> dostaje nowy motyw bez przeładowania.
  revalidatePath('/', 'layout')
  return { error: null, message: 'Zapisano ustawienia' }
}

export async function sendTestNotification(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const typed = parseWebhook(formData.get('discord_webhook_url'))
  if (!typed.ok) return { error: typed.error, message: null }

  const profile = await getProfile()
  const url = resolveWebhook(typed.value ?? profile?.discord_webhook_url ?? null)
  if (!url) return { error: 'Brak skonfigurowanego webhooka Discord', message: null }

  const ok = await sendDiscord(url, '🌱 Test powiadomień Eko Taxi')
  if (!ok) return { error: 'Nie udało się wysłać powiadomienia', message: null }
  return { error: null, message: 'Wysłano testowe powiadomienie' }
}
