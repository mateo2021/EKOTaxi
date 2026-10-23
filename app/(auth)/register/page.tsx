import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Rejestracja — Eko Taxi' }

export default function RegisterPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Pierwszy kurs?</h1>
      <p className="mt-2 mb-8 text-muted">Załóż konto, żeby zamawiać przejazdy.</p>
      <AuthForm mode="register" />
      <p className="mt-6 text-sm text-muted">
        Masz już konto?{' '}
        <Link href="/login" className="font-semibold text-accent underline-offset-4 hover:underline">
          Zaloguj się
        </Link>
      </p>
    </>
  )
}
