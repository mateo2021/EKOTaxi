import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isValidDiscordWebhook,
  sendDiscord,
  rideStatusMessage,
  promoMessage,
  resolveWebhook,
} from '@/lib/discord'
import type { Driver } from '@/lib/types'

const GOOD = 'https://discord.com/api/webhooks/1/abc'
const driver: Driver = { id: 'd1', name: 'Jan', car: 'Toyota Prius', plate: 'WX 12345', rating: 4.9, class: 'economy' }
const ride = { pickup_address: 'Rynek 1', dropoff_address: 'Dworzec', price_pln: 23.5 }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('isValidDiscordWebhook', () => {
  it('accepts discord.com and discordapp.com over https', () => {
    expect(isValidDiscordWebhook(GOOD)).toBe(true)
    expect(isValidDiscordWebhook('https://discordapp.com/api/webhooks/1/abc')).toBe(true)
  })
  it('rejects http, foreign hosts, lookalike hosts and garbage', () => {
    expect(isValidDiscordWebhook('http://discord.com/api/webhooks/1/abc')).toBe(false)
    expect(isValidDiscordWebhook('https://evil.com/api/webhooks/1/abc')).toBe(false)
    expect(isValidDiscordWebhook('https://discord.com.evil.com/api/webhooks/1/a')).toBe(false)
    expect(isValidDiscordWebhook('http://localhost:3000')).toBe(false)
    expect(isValidDiscordWebhook('not a url')).toBe(false)
  })
})

describe('sendDiscord', () => {
  it('posts JSON content and returns true on 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendDiscord(GOOD, 'hej')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(GOOD)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ content: 'hej', allowed_mentions: { parse: [] } })
  })
  it('returns false on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    expect(await sendDiscord(GOOD, 'hej')).toBe(false)
  })
  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await sendDiscord(GOOD, 'hej')).toBe(false)
  })
  it('returns false and does not call fetch for invalid url', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendDiscord('https://evil.com/api/webhooks/1/abc', 'hej')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('truncates content to 2000 characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    await sendDiscord(GOOD, 'a'.repeat(3000))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toHaveLength(2000)
  })
})

describe('rideStatusMessage', () => {
  it('accepted includes driver name, car and plate', () => {
    const m = rideStatusMessage('accepted', driver, ride)
    expect(m).toContain('🚕')
    expect(m).toContain('Jan')
    expect(m).toContain('Toyota Prius')
    expect(m).toContain('WX 12345')
  })
  it('accepted without driver says Kierowca', () => {
    expect(rideStatusMessage('accepted', null, ride)).toContain('Kierowca przyjął')
  })
  it('completed includes price and zł', () => {
    const m = rideStatusMessage('completed', driver, ride)
    expect(m).toContain('✅')
    expect(m).toContain('zł')
    expect(m).toContain('23.5')
  })
  it('covers searching, in_progress and cancelled', () => {
    expect(rideStatusMessage('searching', null, ride)).toContain('Rynek 1 → Dworzec')
    expect(rideStatusMessage('in_progress', driver, ride)).toContain('🌱')
    expect(rideStatusMessage('cancelled', null, ride)).toContain('anulowany')
  })
})

describe('promoMessage', () => {
  it('formats title and body', () => {
    expect(promoMessage({ title: 'Zniżka', body: '-20%' })).toBe('🌱 **Zniżka**\n-20%')
  })
})

describe('resolveWebhook', () => {
  it('prefers a valid profile url', () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/9/env')
    expect(resolveWebhook(GOOD)).toBe(GOOD)
  })
  it('falls back to env when profile is null or invalid', () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/9/env')
    expect(resolveWebhook(null)).toBe('https://discord.com/api/webhooks/9/env')
    expect(resolveWebhook('https://evil.com/api/webhooks/1/a')).toBe('https://discord.com/api/webhooks/9/env')
  })
  it('returns null when nothing valid', () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://evil.com/x')
    expect(resolveWebhook(null)).toBeNull()
    vi.stubEnv('DISCORD_WEBHOOK_URL', '')
    expect(resolveWebhook(null)).toBeNull()
  })
})
