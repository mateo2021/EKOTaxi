export type AuthFormState = { error: string | null }

export type AuthFields = { email: string; password: string; displayName: string }

export const GENERIC_AUTH_ERROR = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.'
export const MISSING_CONFIG_ERROR = 'Brak konfiguracji Supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAuthForm(
  formData: FormData,
  mode: 'login' | 'register',
): { ok: true; data: AuthFields } | { ok: false; error: string } {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const displayName = String(formData.get('display_name') ?? '').trim()

  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Podaj poprawny adres e-mail' }
  if (password.length < 6) return { ok: false, error: 'Hasło musi mieć co najmniej 6 znaków' }
  if (mode === 'register' && (displayName.length < 1 || displayName.length > 50)) {
    return { ok: false, error: 'Imię musi mieć od 1 do 50 znaków' }
  }
  return { ok: true, data: { email, password, displayName } }
}

export function authErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') {
    return 'Nieprawidłowy e-mail lub hasło'
  }
  if (error.code === 'user_already_exists' || error.message === 'User already registered') {
    return 'Konto z tym e-mailem już istnieje'
  }
  return GENERIC_AUTH_ERROR
}
