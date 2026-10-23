export const MAX_PROMO_TITLE = 80
export const MAX_PROMO_BODY = 500

export interface PromoInput {
  title: string
  body: string
}

export type PromoParse = { ok: true; value: PromoInput } | { ok: false; error: string }

export function parsePromoBody(raw: unknown): PromoParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Nieprawidłowe dane promocji' }
  }
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string') return { ok: false, error: 'Podaj tytuł promocji' }
  if (typeof r.body !== 'string') return { ok: false, error: 'Podaj treść promocji' }
  const title = r.title.trim()
  const body = r.body.trim()
  if (title.length < 1) return { ok: false, error: 'Podaj tytuł promocji' }
  if (title.length > MAX_PROMO_TITLE) {
    return { ok: false, error: `Tytuł może mieć najwyżej ${MAX_PROMO_TITLE} znaków` }
  }
  if (body.length < 1) return { ok: false, error: 'Podaj treść promocji' }
  if (body.length > MAX_PROMO_BODY) {
    return { ok: false, error: `Treść może mieć najwyżej ${MAX_PROMO_BODY} znaków` }
  }
  return { ok: true, value: { title, body } }
}
