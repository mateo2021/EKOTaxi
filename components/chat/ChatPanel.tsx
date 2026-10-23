'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createBrowserSupabase } from '@/lib/supabase/client'
import type { ChatMessage } from '@/lib/types'

export const MAX_QUESTION = 500
const HISTORY_LIMIT = 30
const HEARTBEAT_POLL_MS = 10_000
const ONLINE_WITHIN_MS = 30_000

const ERROR_TEXT = 'Nie udało się odpowiedzieć — spróbuj ponownie.'
const SUGGESTIONS = [
  'Ile zapłacę za 10 km Comfortem?',
  'Czym różni się XL od Comfortu?',
  'Podsumuj moje ostatnie kursy',
]

type Online = 'unknown' | 'online' | 'offline'

function mergeMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = list.findIndex((m) => m.id === msg.id)
  if (i === -1) return [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const next = list.slice()
  next[i] = { ...list[i], ...msg }
  return next
}

/** Przycisk w nawigacji + wysuwany panel czatu z asystentem (worker z `claude -p`). */
export function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [online, setOnline] = useState<Online>('unknown')

  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const userIdRef = useRef<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const client = useCallback(() => {
    supabaseRef.current ??= createBrowserSupabase()
    return supabaseRef.current
  }, [])

  // Otwarcie: historia + Realtime UPDATE na własnych wiadomościach.
  useEffect(() => {
    if (!open) return
    const supabase = client()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null
      if (cancelled) return
      userIdRef.current = uid
      if (!uid) {
        setLoadError('Sesja wygasła. Zaloguj się ponownie.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)
      if (cancelled) return
      if (error) setLoadError('Nie udało się wczytać rozmowy. Sprawdź internet i otwórz czat ponownie.')
      else setMessages((data as ChatMessage[]).reverse())
      setLoading(false)

      channel = supabase
        .channel(`chat-${uid}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${uid}` },
          (payload) => setMessages((cur) => mergeMessage(cur, payload.new as ChatMessage)),
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [open, client])

  // Kropka online/offline: heartbeat workera co 10 s. Przy okazji dociągamy
  // oczekujące odpowiedzi, gdyby zdarzenie Realtime nie dotarło.
  useEffect(() => {
    if (!open) return
    const supabase = client()
    let cancelled = false
    const tick = async () => {
      const { data, error } = await supabase.from('worker_heartbeat').select('last_seen').eq('id', 1).maybeSingle()
      if (cancelled) return
      const fresh = !error && data && Date.now() - Date.parse(data.last_seen) < ONLINE_WITHIN_MS
      setOnline(fresh ? 'online' : 'offline')

      const uid = userIdRef.current
      if (!uid) return
      const { data: pending } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'pending')
      if (cancelled || !pending) return
      const stillPending = new Set(pending.map((p: { id: string }) => p.id))
      const changed = messagesRef.current.filter((m) => m.status === 'pending' && !stillPending.has(m.id))
      if (changed.length) await refetch(changed.map((m) => m.id))
    }
    const refetch = async (ids: string[]) => {
      const { data } = await supabase.from('chat_messages').select('*').in('id', ids)
      if (cancelled || !data) return
      setMessages((cur) => (data as ChatMessage[]).reduce(mergeMessage, cur))
    }
    void tick()
    const id = setInterval(tick, HEARTBEAT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open, client])

  // Escape zamyka; blokada przewijania strony pod panelem; fokus na pole.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    const trigger = triggerRef.current
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      trigger?.focus()
    }
  }, [open])

  // Nowa wiadomość / odpowiedź → przewiń na dół.
  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages])

  async function send(text: string) {
    const question = text.trim()
    const uid = userIdRef.current
    if (!question || question.length > MAX_QUESTION || sending || !uid) return
    setSending(true)
    setSendError(null)
    const { data, error } = await client()
      .from('chat_messages')
      .insert({ user_id: uid, question })
      .select('*')
      .single()
    setSending(false)
    if (error || !data) {
      setSendError('Nie udało się wysłać pytania. Sprawdź internet i spróbuj ponownie.')
      return
    }
    setDraft('')
    setMessages((cur) => mergeMessage(cur, data as ChatMessage))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(draft)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(draft)
    }
  }

  const remaining = MAX_QUESTION - draft.length
  const canSend = draft.trim().length > 0 && !sending && !loadError

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Czat z asystentem"
        className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-40 grid size-12 cursor-pointer place-items-center rounded-full border border-border bg-surface text-accent shadow-sheet md:static md:flex md:size-auto md:min-h-11 md:flex-none md:items-center md:justify-center md:rounded-control md:border-0 md:bg-transparent md:px-4 md:text-sm md:font-medium md:text-muted md:shadow-none md:transition-colors md:hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="size-6 md:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
        </svg>
        <span className="hidden md:inline">Czat</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Zamknij czat"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 hidden cursor-default bg-text/25 md:block"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-title"
            className="chat-sheet relative flex h-dvh w-full flex-col bg-surface md:m-4 md:h-[calc(100dvh-2rem)] md:w-[26rem] md:rounded-sheet md:border md:border-border md:shadow-sheet"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))]">
              <span aria-hidden="true" className={`chat-dot is-${online}`} />
              <div className="min-w-0 flex-1">
                <h2 id="chat-title" className="font-display text-base font-semibold tracking-tight">
                  Asystent Eko Taxi
                </h2>
                <p className="text-xs text-muted" aria-live="polite">
                  {online === 'online' ? 'Asystent online' : online === 'offline' ? 'Asystent offline' : 'Sprawdzam połączenie…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 cursor-pointer place-items-center rounded-control text-muted transition-colors hover:bg-bg hover:text-text"
                aria-label="Zamknij czat"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            {online === 'offline' && (
              <p className="border-b border-border bg-bg px-5 py-2.5 text-sm text-muted">
                Asystent offline — odpowiedź pojawi się po jego uruchomieniu.
              </p>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite">
              {loading && messages.length === 0 ? (
                <p className="px-1 text-sm text-muted">Wczytuję rozmowę…</p>
              ) : loadError ? (
                <p className="px-1 text-sm text-danger">{loadError}</p>
              ) : messages.length === 0 ? (
                <div className="px-1 pt-2">
                  <p className="font-display text-lg font-semibold leading-snug tracking-tight">
                    Zapytaj o cenę, klasę auta albo swoje kursy.
                  </p>
                  <p className="mt-2 text-sm text-muted">Asystent zna cennik Eko Taxi i Twoje 5 ostatnich przejazdów.</p>
                  <ul className="mt-5 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => void send(s)}
                          disabled={sending}
                          className="cursor-pointer rounded-full border border-border px-4 py-2 text-left text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ol className="flex flex-col gap-5">
                  {messages.map((m) => (
                    <li key={m.id} className="flex flex-col gap-2">
                      <p className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[1.25rem] rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-contrast">
                        {m.question}
                      </p>
                      {m.status === 'pending' ? (
                        <p className="flex items-center gap-2 self-start px-1 text-sm text-muted">
                          <span className="chat-typing" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          Asystent pisze…
                        </p>
                      ) : m.status === 'error' ? (
                        <p className="max-w-[85%] self-start rounded-[1.25rem] rounded-bl-md border border-danger/40 px-4 py-2.5 text-sm text-danger">
                          {ERROR_TEXT}
                        </p>
                      ) : (
                        <p className="max-w-[85%] self-start whitespace-pre-wrap break-words rounded-[1.25rem] rounded-bl-md bg-bg px-4 py-2.5 text-sm leading-relaxed">
                          {m.answer}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <div ref={listEndRef} />
            </div>

            <form onSubmit={onSubmit} className="border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {sendError && <p className="mb-2 px-1 text-sm text-danger">{sendError}</p>}
              <div className="flex items-end gap-2 rounded-control border border-border bg-bg p-1.5 focus-within:border-accent">
                <label htmlFor="chat-input" className="sr-only">
                  Twoje pytanie
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_QUESTION))}
                  onKeyDown={onKeyDown}
                  maxLength={MAX_QUESTION}
                  rows={2}
                  placeholder="Napisz pytanie…"
                  aria-describedby="chat-counter"
                  className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:outline-none placeholder:text-muted"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="min-h-11 cursor-pointer rounded-control bg-accent px-4 text-sm font-semibold text-accent-contrast transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? 'Wysyłam…' : 'Wyślij'}
                </button>
              </div>
              <p
                id="chat-counter"
                className={`mt-1.5 px-1 text-right text-xs tabular-nums ${remaining <= 20 ? 'text-danger' : 'text-muted'}`}
              >
                {draft.length}/{MAX_QUESTION}
              </p>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
