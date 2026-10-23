import { after } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getApiUserId, UNAUTHORIZED } from '@/lib/rides-service'
import { parsePromoBody } from '@/lib/promos-validation'
import { promoMessage, resolveWebhook, sendDiscord } from '@/lib/discord'
import type { Promo } from '@/lib/types'

async function broadcast(promo: Promo) {
  try {
    const admin = createAdminSupabase()
    const { data, error } = await admin
      .from('profiles')
      .select('discord_webhook_url')
      .eq('notify_promos', true)
    if (error) throw error
    const urls = new Set<string>()
    for (const row of data ?? []) {
      const url = resolveWebhook((row as { discord_webhook_url: string | null }).discord_webhook_url)
      if (url) urls.add(url)
    }
    const results = await Promise.allSettled([...urls].map((u) => sendDiscord(u, promoMessage(promo))))
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length
    console.log(`[promos] broadcast: ${sent}/${urls.size} wysłano`)
  } catch (e) {
    console.error('[promos] broadcast failed', e)
  }
}

export async function POST(request: Request) {
  const userId = await getApiUserId()
  if (!userId) return UNAUTHORIZED()

  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) {
    console.error('[promos] profile', profileError)
    return Response.json({ error: 'Nie udało się dodać promocji' }, { status: 500 })
  }
  if (!profile?.is_admin) return Response.json({ error: 'Brak uprawnień' }, { status: 403 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: 'Nieprawidłowe dane promocji' }, { status: 400 })
  }
  const parsed = parsePromoBody(json)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin.from('promos').insert(parsed.value).select('*').single()
  if (error || !data) {
    console.error('[promos] insert', error)
    return Response.json({ error: 'Nie udało się dodać promocji' }, { status: 500 })
  }
  const promo = data as Promo
  after(() => broadcast(promo))
  return Response.json({ promo }, { status: 201 })
}
