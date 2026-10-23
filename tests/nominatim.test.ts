import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createRateGate,
  formatLatLng,
  MIN_INTERVAL_MS,
  mapSearchResults,
  reverseGeocode,
  searchAddress,
  shortenDisplayName,
} from '@/lib/nominatim'

/** Bramka bez czekania — testy mapowania nie sprawdzają limitu. */
const open = { wait: async () => {} }

const LONG =
  '10, Marszałkowska, Śródmieście Południowe, Śródmieście, Warszawa, województwo mazowieckie, 00-626, Polska'

function stubFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response)
}

describe('shortenDisplayName', () => {
  it('keeps the first 3 comma parts', () => {
    expect(shortenDisplayName(LONG)).toBe('10, Marszałkowska, Śródmieście Południowe')
    expect(shortenDisplayName(LONG, 2)).toBe('10, Marszałkowska')
  })
  it('clips to 200 characters', () => {
    expect(shortenDisplayName('a'.repeat(300)).length).toBe(200)
  })
})

describe('mapSearchResults', () => {
  it('maps display_name and string lat/lon to numbers', () => {
    const [p] = mapSearchResults([{ display_name: LONG, lat: '52.2297', lon: '21.0122' }])
    expect(p.lat).toBe(52.2297)
    expect(p.lng).toBe(21.0122)
    expect(p.address).toBe('10, Marszałkowska, Śródmieście Południowe')
    expect(p.context).toBe('Marszałkowska, Śródmieście Południowe, Śródmieście')
  })
  it('prefers structured address details: street + number, city', () => {
    const [p] = mapSearchResults([
      {
        display_name: LONG,
        lat: '52.1',
        lon: '21.1',
        name: '',
        address: { road: 'Marszałkowska', house_number: '10', city: 'Warszawa' },
      },
    ])
    expect(p.address).toBe('Marszałkowska 10, Warszawa')
  })
  it('puts a named place first', () => {
    const [p] = mapSearchResults([
      {
        display_name: 'Pałac Kultury i Nauki, 1, plac Defilad, Warszawa',
        lat: '52.23',
        lon: '21.0',
        name: 'Pałac Kultury i Nauki',
        address: { road: 'plac Defilad', house_number: '1', city: 'Warszawa' },
      },
    ])
    expect(p.address).toBe('Pałac Kultury i Nauki, plac Defilad 1, Warszawa')
  })
  it('skips entries without a name or with bad coordinates', () => {
    expect(
      mapSearchResults([
        { display_name: '', lat: '1', lon: '2' },
        { display_name: 'X', lat: 'abc', lon: '2' },
        null,
      ]),
    ).toEqual([])
    expect(mapSearchResults({ error: 'x' })).toEqual([])
  })
})

describe('searchAddress', () => {
  it('does not query for fewer than 3 characters', async () => {
    const f = stubFetch([])
    expect(await searchAddress('ab', undefined, f, open)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
  it('queries Nominatim in Poland, in Polish, limit 5', async () => {
    const f = stubFetch([{ display_name: LONG, lat: '52', lon: '21' }])
    const res = await searchAddress(' Marszałkowska ', undefined, f, open)
    expect(res).toHaveLength(1)
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('countrycodes')).toBe('pl')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('accept-language')).toBe('pl')
    expect(url.searchParams.get('q')).toBe('Marszałkowska')
  })
  it('passes the abort signal through and throws on HTTP errors', async () => {
    const ctrl = new AbortController()
    const f = stubFetch([], false)
    await expect(searchAddress('Rynek', ctrl.signal, f, open)).rejects.toThrow()
    expect((f.mock.calls[0] as unknown[])[1]).toEqual({ signal: ctrl.signal })
  })
})

describe('reverseGeocode', () => {
  it('returns the short address', async () => {
    const f = stubFetch({
      display_name: LONG,
      lat: '52.2',
      lon: '21.0',
      address: { road: 'Marszałkowska', house_number: '10', city: 'Warszawa' },
    })
    expect(await reverseGeocode(52.2, 21.0, undefined, f, open)).toBe('Marszałkowska 10, Warszawa')
  })
  it('falls back to "lat, lng" on errors', async () => {
    expect(await reverseGeocode(52.123456, 21.654321, undefined, stubFetch({}, false), open)).toBe(
      '52.12346, 21.65432',
    )
    expect(await reverseGeocode(52, 21, undefined, stubFetch({ error: 'Unable to geocode' }), open)).toBe(
      formatLatLng(52, 21),
    )
    const boom = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await reverseGeocode(52, 21, undefined, boom, open)).toBe('52.00000, 21.00000')
  })
})

describe('mapSearchResults dedupe', () => {
  it('keeps one entry per short address (street segments)', () => {
    const seg = (ctx: string, lat: string) => ({
      display_name: `Marszałkowska, ${ctx}, Warszawa, Polska`,
      lat,
      lon: '21',
      name: 'Marszałkowska',
      address: { road: 'Marszałkowska', city: 'Warszawa' },
    })
    const res = mapSearchResults([seg('Oleandrów', '52.21'), seg('Krucza', '52.22'), seg('Koszyki', '52.23')])
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ address: 'Marszałkowska, Warszawa', lat: 52.21 })
  })
})

describe('rate gate (Nominatim: max 1 req/s)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts two rapid calls (search + reverse) at least 1000 ms apart, without dropping either', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const gate = createRateGate()
    const starts: number[] = []
    const f = vi.fn(async () => {
      starts.push(Date.now())
      return { ok: true, status: 200, json: async () => [] } as unknown as Response
    })
    const a = searchAddress('Rynek Główny', undefined, f, gate)
    const b = reverseGeocode(52, 21, undefined, f, gate)
    await vi.advanceTimersByTimeAsync(0)
    expect(starts).toEqual([10_000])
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS - 1)
    expect(starts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([a, b])
    expect(starts).toEqual([10_000, 10_000 + MIN_INTERVAL_MS])
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000)
  })

  it('queues a third call behind the second', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const gate = createRateGate()
    const starts: number[] = []
    const run = () => gate.wait().then(() => starts.push(Date.now()))
    await Promise.all([run(), run(), run(), vi.advanceTimersByTimeAsync(3000)])
    expect(starts).toEqual([0, 1000, 2000])
  })

  it('rejects an aborted wait and frees its slot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const gate = createRateGate()
    await gate.wait()
    const ctrl = new AbortController()
    const waiting = gate.wait(ctrl.signal)
    ctrl.abort()
    await expect(waiting).rejects.toBeDefined()
    const starts: number[] = []
    const next = gate.wait().then(() => starts.push(Date.now()))
    await vi.advanceTimersByTimeAsync(1000)
    await next
    expect(starts).toEqual([1000])
  })

  it('rejects immediately when the signal is already aborted, without fetching', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const f = vi.fn()
    await expect(searchAddress('Rynek', ctrl.signal, f as unknown as typeof fetch, createRateGate())).rejects.toBeDefined()
    await expect(reverseGeocode(1, 2, ctrl.signal, f as unknown as typeof fetch, createRateGate())).rejects.toBeDefined()
    expect(f).not.toHaveBeenCalled()
  })
})
