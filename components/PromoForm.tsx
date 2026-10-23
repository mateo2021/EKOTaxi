'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_PROMO_BODY, MAX_PROMO_TITLE } from '@/lib/promos-validation'

const fieldClass =
  'w-full rounded-control border border-border bg-bg px-4 py-3 text-base placeholder:text-muted/70'

export function PromoForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Nie udało się dodać promocji')
        return
      }
      setTitle('')
      setBody('')
      setDone(true)
      router.refresh()
    } catch {
      setError('Brak połączenia. Spróbuj ponownie.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-8 flex flex-col gap-4 rounded-sheet border border-accent/40 bg-surface p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Nowa promocja</h2>
        <p className="mt-1 text-sm text-muted">Trafi na listę i na Discorda użytkowników, którzy włączyli powiadomienia o promocjach.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Tytuł
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_PROMO_TITLE}
          required
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Treść
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_PROMO_BODY}
          required
          rows={4}
          className={fieldClass}
        />
        <span className="self-end text-xs font-normal text-muted tabular-nums">
          {body.length}/{MAX_PROMO_BODY}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-accent">
          Promocja dodana.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-control bg-accent px-5 font-display font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Dodawanie…' : 'Dodaj promocję'}
      </button>
    </form>
  )
}
