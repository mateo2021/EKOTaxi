import { describe, it, expect } from 'vitest'
import { validateAuthForm, authErrorMessage, GENERIC_AUTH_ERROR } from '@/lib/auth'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('validateAuthForm', () => {
  it('przyjmuje poprawne logowanie i przycina e-mail', () => {
    const r = validateAuthForm(form({ email: ' Ala@Example.com ', password: 'sekret' }), 'login')
    expect(r).toEqual({ ok: true, data: { email: 'Ala@Example.com', password: 'sekret', displayName: '' } })
  })

  it('odrzuca zły e-mail', () => {
    const r = validateAuthForm(form({ email: 'ala@', password: 'sekret' }), 'login')
    expect(r).toEqual({ ok: false, error: 'Podaj poprawny adres e-mail' })
  })

  it('odrzuca hasło krótsze niż 6 znaków', () => {
    const r = validateAuthForm(form({ email: 'a@b.pl', password: '12345' }), 'login')
    expect(r).toEqual({ ok: false, error: 'Hasło musi mieć co najmniej 6 znaków' })
  })

  it('wymaga nazwy 1–50 znaków przy rejestracji', () => {
    expect(validateAuthForm(form({ email: 'a@b.pl', password: '123456', display_name: '  ' }), 'register'))
      .toEqual({ ok: false, error: 'Imię musi mieć od 1 do 50 znaków' })
    expect(validateAuthForm(form({ email: 'a@b.pl', password: '123456', display_name: 'x'.repeat(51) }), 'register'))
      .toEqual({ ok: false, error: 'Imię musi mieć od 1 do 50 znaków' })
    expect(validateAuthForm(form({ email: 'a@b.pl', password: '123456', display_name: ' Ala ' }), 'register'))
      .toEqual({ ok: true, data: { email: 'a@b.pl', password: '123456', displayName: 'Ala' } })
  })

  it('nie wymaga nazwy przy logowaniu', () => {
    expect(validateAuthForm(form({ email: 'a@b.pl', password: '123456' }), 'login').ok).toBe(true)
  })
})

describe('authErrorMessage', () => {
  it('tłumaczy błędne dane logowania', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe('Nieprawidłowy e-mail lub hasło')
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'x' })).toBe('Nieprawidłowy e-mail lub hasło')
  })

  it('tłumaczy istniejące konto', () => {
    expect(authErrorMessage({ message: 'User already registered' })).toBe('Konto z tym e-mailem już istnieje')
    expect(authErrorMessage({ code: 'user_already_exists', message: 'x' })).toBe('Konto z tym e-mailem już istnieje')
  })

  it('zwraca ogólny komunikat dla innych błędów', () => {
    expect(authErrorMessage({ message: 'Database error saving new user' })).toBe(GENERIC_AUTH_ERROR)
  })
})
