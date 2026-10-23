import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Logowanie — Eko Taxi' }

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">Dokąd jedziemy?</h1>
      <p className="mt-2 mb-8 text-muted">Zaloguj się, żeby zamówić przejazd.</p>
      <AuthForm mode="login" />
      <p className="mt-6 text-sm text-muted">
        Nie masz konta?{' '}
        <Link href="/register" className="font-semibold text-accent underline-offset-4 hover:underline">
          Zarejestruj się
        </Link>
      </p>
    </>
  )
}
