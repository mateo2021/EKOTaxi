'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import {
  authErrorMessage,
  validateAuthForm,
  MISSING_CONFIG_ERROR,
  type AuthFormState,
} from '@/lib/auth'

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = validateAuthForm(formData, 'login')
  if (!parsed.ok) return { error: parsed.error }
  if (!isSupabaseConfigured()) return { error: MISSING_CONFIG_ERROR }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: authErrorMessage(error) }

  redirect('/')
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = validateAuthForm(formData, 'register')
  if (!parsed.ok) return { error: parsed.error }
  if (!isSupabaseConfigured()) return { error: MISSING_CONFIG_ERROR }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error) return { error: authErrorMessage(error) }
  // Przy włączonym „Confirm email” Supabase nie zwraca błędu dla istniejącego konta,
  // tylko użytkownika bez tożsamości.
  if (data.user && data.user.identities?.length === 0) {
    return { error: authErrorMessage({ message: 'User already registered' }) }
  }
  if (!data.session) {
    return { error: 'Potwierdź adres e-mail, klikając link w wiadomości, a potem zaloguj się.' }
  }

  redirect('/')
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase()
    await supabase.auth.signOut()
  }
  redirect('/login')
}
