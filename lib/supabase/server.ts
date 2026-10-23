import { createServerClient } from '@supabase/ssr'
import { getSupabaseEnv } from './env'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  const { url, anonKey } = getSupabaseEnv()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Wywołane z Server Component — odświeżaniem sesji zajmuje się middleware.
          }
        },
      },
    }
  )
}
