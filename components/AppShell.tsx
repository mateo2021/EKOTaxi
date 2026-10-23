import type { ReactNode } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/actions'

const links = [
  { href: '/', label: 'Mapa' },
  { href: '/history', label: 'Historia' },
  { href: '/promos', label: 'Promocje' },
  { href: '/settings', label: 'Ustawienia' },
]

const itemClass =
  'flex min-h-11 flex-1 items-center justify-center rounded-control px-2 text-sm font-medium text-muted transition-colors hover:text-text md:flex-none md:px-4'

/** Nawigacja stron po zalogowaniu: dolny pasek na telefonie, górny od md. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:static md:border-b md:border-t-0">
        <nav
          aria-label="Główna nawigacja"
          className="mx-auto flex max-w-3xl items-center gap-1 px-2 py-1.5 md:max-w-5xl md:px-6"
        >
          <span className="mr-4 hidden items-center gap-2.5 font-display text-base font-semibold tracking-tight md:flex">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-accent ring-4 ring-accent/20" />
            Eko Taxi
          </span>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={itemClass}>
              {l.label}
            </Link>
          ))}
          {/* Miejsce na przycisk czatu (dodaje go późniejsze zadanie). */}
          <form action={signOut} className="flex flex-1 md:ml-auto md:flex-none">
            <button type="submit" className={`${itemClass} w-full cursor-pointer`}>
              Wyloguj
            </button>
          </form>
        </nav>
      </header>
      <div className="flex-1 pb-20 md:pb-0">{children}</div>
    </div>
  )
}
