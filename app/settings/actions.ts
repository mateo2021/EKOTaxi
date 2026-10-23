'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { resolveWebhook, sendDiscord } from '@/lib/discord'
import { parseProfileForm } from '@/lib/profile'
import { getSession } from '@/lib/profile-server'

export type SettingsState = { error: string | null; message: string | null }

const NOT_LOGGED_IN = 'Zaloguj się, aby zmienić ustawienia'
const MISSING_CONFIG = 'Brak konfiguracji Supabase'

export async function updateProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = parseProfileForm(formData)
  if (!parsed.ok) return { error: parsed.error, message: null }
  if (!isSupabaseConfigured()) return { error: MISSING_CONFIG, message: null }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_LOGGED_IN, message: null }

  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', user.id)
    .select('id')
  if (error || !data || data.length === 0) {
    return { error: 'Nie udało się zapisać ustawień', message: null }
  }

  // Odświeża layout, więc <html data-theme> dostaje nowy motyw bez przeładowania.
  revalidatePath('/', 'layout')
  return { error: null, message: 'Zapisano ustawienia' }
}

/** Wysyła test wyłącznie na zapisany webhook użytkownika (lub domyślny z env); ignoruje dane z formularza. */
export async function sendTestNotification(): Promise<SettingsState> {
  const { userId, profile } = await getSession()
  if (!userId) return { error: NOT_LOGGED_IN, message: null }

  const url = resolveWebhook(profile?.discord_webhook_url ?? null)
  if (!url) return { error: 'Brak skonfigurowanego webhooka Discord', message: null }

  const ok = await sendDiscord(url, '🌱 Test powiadomień Eko Taxi')
  if (!ok) return { error: 'Nie udało się wysłać powiadomienia', message: null }
  return { error: null, message: 'Wysłano testowe powiadomienie' }
}
