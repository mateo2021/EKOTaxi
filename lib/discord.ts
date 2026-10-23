import type { Driver, Promo, Ride, RideStatus } from '@/lib/types'

const ALLOWED_HOSTS = ['discord.com', 'discordapp.com']
const MAX_CONTENT = 2000

export function isValidDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      ALLOWED_HOSTS.includes(u.hostname) &&
      u.pathname.startsWith('/api/webhooks/')
    )
  } catch {
    return false
  }
}

export async function sendDiscord(webhookUrl: string, content: string): Promise<boolean> {
  if (!isValidDiscordWebhook(webhookUrl)) return false
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content.slice(0, MAX_CONTENT),
        // Adresy wpisuje użytkownik — nie pozwalamy na @everyone / @here / pingi.
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

export function rideStatusMessage(
  status: RideStatus,
  driver: Driver | null,
  ride: Pick<Ride, 'pickup_address' | 'dropoff_address' | 'price_pln'>,
): string {
  const route = `${ride.pickup_address} → ${ride.dropoff_address}`
  switch (status) {
    case 'searching':
      return `🔎 Szukamy kierowcy dla kursu ${route}`
    case 'accepted': {
      const who = driver ? `Kierowca ${driver.name} (${driver.car}, ${driver.plate})` : 'Kierowca'
      return `🚕 ${who} przyjął Twój kurs i jest w drodze po Ciebie`
    }
    case 'in_progress':
      return `🌱 Jesteś w trasie: ${route}`
    case 'completed':
      return `✅ Dojechałeś! Kurs ${route} zakończony. Do zapłaty: ${ride.price_pln} zł`
    case 'cancelled':
      return `❌ Kurs ${route} został anulowany`
  }
}

export function promoMessage(promo: Pick<Promo, 'title' | 'body'>): string {
  return `🌱 **${promo.title}**\n${promo.body}`
}

export function resolveWebhook(profileUrl: string | null): string | null {
  if (profileUrl && isValidDiscordWebhook(profileUrl)) return profileUrl
  const env = process.env.DISCORD_WEBHOOK_URL
  if (env && isValidDiscordWebhook(env)) return env
  return null
}
