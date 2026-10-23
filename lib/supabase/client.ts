import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseEnv } from './env'

export function createBrowserSupabase() {
  const { url, anonKey } = getSupabaseEnv()
  return createBrowserClient(url, anonKey)
}
