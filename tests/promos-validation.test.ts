import { describe, expect, it } from 'vitest'
import { parsePromoBody } from '@/lib/promos-validation'

describe('parsePromoBody', () => {
  it('przyjmuje poprawne dane i przycina spacje', () => {
    expect(parsePromoBody({ title: '  Zima  ', body: ' -20% ' })).toEqual({
      ok: true,
      value: { title: 'Zima', body: '-20%' },
    })
  })
  it('odrzuca brak lub nie-string', () => {
    expect(parsePromoBody(null).ok).toBe(false)
    expect(parsePromoBody({ body: 'x' }).ok).toBe(false)
    expect(parsePromoBody({ title: 1, body: 'x' }).ok).toBe(false)
    expect(parsePromoBody({ title: 'x' }).ok).toBe(false)
    expect(parsePromoBody({ title: 'x', body: 5 }).ok).toBe(false)
  })
  it('odrzuca puste po trim', () => {
    expect(parsePromoBody({ title: '   ', body: 'x' }).ok).toBe(false)
    expect(parsePromoBody({ title: 'x', body: '  ' }).ok).toBe(false)
  })
  it('granice długości', () => {
    expect(parsePromoBody({ title: 'a'.repeat(80), body: 'b'.repeat(500) }).ok).toBe(true)
    expect(parsePromoBody({ title: 'a'.repeat(81), body: 'b' }).ok).toBe(false)
    expect(parsePromoBody({ title: 'a', body: 'b'.repeat(501) }).ok).toBe(false)
  })
})
