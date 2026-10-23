'use client'

import { useActionState } from 'react'
import { signIn, signUp } from './actions'
import type { AuthFormState } from '@/lib/auth'

const initialState: AuthFormState = { error: null }

const inputClass =
  'w-full rounded-control border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted/70 outline-none transition-colors focus:border-accent focus-visible:outline-none focus:ring-2 focus:ring-accent/25'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [state, formAction, pending] = useActionState(mode === 'login' ? signIn : signUp, initialState)
  const isRegister = mode === 'register'

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {isRegister && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Imię</span>
          <input
            name="display_name"
            type="text"
            autoComplete="given-name"
            required
            maxLength={50}
            placeholder="np. Ala"
            className={inputClass}
          />
          <span className="text-sm text-muted">Tak przedstawi cię kierowca.</span>
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="ty@example.com"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Hasło</span>
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          minLength={6}
          className={inputClass}
        />
        {isRegister && <span className="text-sm text-muted">Co najmniej 6 znaków.</span>}
      </label>

      <p aria-live="polite" role="status" className="min-h-5 text-sm font-medium text-danger">
        {state.error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Chwileczkę…' : isRegister ? 'Załóż konto' : 'Zaloguj się'}
      </button>
    </form>
  )
}
