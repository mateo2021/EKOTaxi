import { describe, expect, it } from 'vitest'
import { parseProfileForm } from '@/lib/profile'

const HOOK = 'https://discord.com/api/webhooks/123/abc'

function form(o: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const base = { display_name: 'Ala', theme: 'dark', default_class: 'comfort' }

describe('parseProfileForm', () => {
  it('przyjmuje poprawne dane; brak checkboxa = false; pusty webhook = null', () => {
    const r = parseProfileForm(form({ ...base, notify_promos: 'on', discord_webhook_url: '  ' }))
    expect(r).toEqual({
      ok: true,
      data: {
        display_name: 'Ala',
        theme: 'dark',
        default_class: 'comfort',
        notify_ride_status: false,
        notify_promos: true,
        discord_webhook_url: null,
      },
    })
  })
  it('zapisuje poprawny webhook i nie zawiera is_admin', () => {
    const r = parseProfileForm(form({ ...base, discord_webhook_url: HOOK, is_admin: 'true' }))
    expect(r.ok && r.data.discord_webhook_url).toBe(HOOK)
    expect(r.ok && 'is_admin' in r.data).toBe(false)
  })
  it('odrzuca zły webhook', () => {
    const r = parseProfileForm(form({ ...base, discord_webhook_url: 'https://evil.com/api/webhooks/1' }))
    expect(r).toEqual({ ok: false, error: 'To nie jest adres webhooka Discord' })
  })
  it('odrzuca za długi webhook', () => {
    const r = parseProfileForm(form({ ...base, discord_webhook_url: HOOK + 'a'.repeat(300) }))
    expect(r.ok).toBe(false)
  })
  it('waliduje imię, motyw i klasę', () => {
    expect(parseProfileForm(form({ ...base, display_name: '   ' })).ok).toBe(false)
    expect(parseProfileForm(form({ ...base, display_name: 'a'.repeat(51) })).ok).toBe(false)
    expect(parseProfileForm(form({ ...base, theme: 'blue' })).ok).toBe(false)
    expect(parseProfileForm(form({ ...base, default_class: 'vip' })).ok).toBe(false)
    expect(parseProfileForm(form({ ...base, display_name: 'a'.repeat(50) })).ok).toBe(true)
  })
})
