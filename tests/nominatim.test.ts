import { describe, it, expect, vi } from 'vitest'
import {
  formatLatLng,
  mapSearchResults,
  reverseGeocode,
  searchAddress,
  shortenDisplayName,
} from '@/lib/nominatim'

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
    expect(await searchAddress('ab', undefined, f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
  it('queries Nominatim in Poland, in Polish, limit 5', async () => {
    const f = stubFetch([{ display_name: LONG, lat: '52', lon: '21' }])
    const res = await searchAddress(' Marszałkowska ', undefined, f)
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
    await expect(searchAddress('Rynek', ctrl.signal, f)).rejects.toThrow()
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
    expect(await reverseGeocode(52.2, 21.0, undefined, f)).toBe('Marszałkowska 10, Warszawa')
  })
  it('falls back to "lat, lng" on errors', async () => {
    expect(await reverseGeocode(52.123456, 21.654321, undefined, stubFetch({}, false))).toBe(
      '52.12346, 21.65432',
    )
    expect(await reverseGeocode(52, 21, undefined, stubFetch({ error: 'Unable to geocode' }))).toBe(
      formatLatLng(52, 21),
    )
    const boom = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await reverseGeocode(52, 21, undefined, boom)).toBe('52.00000, 21.00000')
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
