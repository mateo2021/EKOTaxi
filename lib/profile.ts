import { isValidDiscordWebhook } from '@/lib/discord'
import type { RideClass, Theme } from '@/lib/types'

export const THEMES: readonly Theme[] = ['light', 'dark']
export const RIDE_CLASSES: readonly RideClass[] = ['economy', 'comfort', 'xl']
export const MAX_NAME = 50
export const MAX_WEBHOOK = 300

export const WEBHOOK_ERROR = 'To nie jest adres webhooka Discord'

/** Tylko kolumny objęte grantem; nigdy is_admin. */
export interface ProfileUpdate {
  display_name: string
  theme: Theme
  default_class: RideClass
  notify_ride_status: boolean
  notify_promos: boolean
  discord_webhook_url: string | null
}

export type ProfileParse = { ok: true; data: ProfileUpdate } | { ok: false; error: string }

export function parseWebhook(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (v === '') return { ok: true, value: null }
  if (v.length > MAX_WEBHOOK || !isValidDiscordWebhook(v)) return { ok: false, error: WEBHOOK_ERROR }
  return { ok: true, value: v }
}

export function parseProfileForm(formData: FormData): ProfileParse {
  const name = String(formData.get('display_name') ?? '').trim()
  if (name.length < 1 || name.length > MAX_NAME) {
    return { ok: false, error: `Imię musi mieć od 1 do ${MAX_NAME} znaków` }
  }
  const theme = String(formData.get('theme') ?? '')
  if (!THEMES.includes(theme as Theme)) return { ok: false, error: 'Wybierz motyw: jasny lub ciemny' }
  const cls = String(formData.get('default_class') ?? '')
  if (!RIDE_CLASSES.includes(cls as RideClass)) return { ok: false, error: 'Wybierz domyślną klasę przejazdu' }
  const hook = parseWebhook(formData.get('discord_webhook_url'))
  if (!hook.ok) return { ok: false, error: hook.error }
  return {
    ok: true,
    data: {
      display_name: name,
      theme: theme as Theme,
      default_class: cls as RideClass,
      notify_ride_status: formData.get('notify_ride_status') === 'on',
      notify_promos: formData.get('notify_promos') === 'on',
      discord_webhook_url: hook.value,
    },
  }
}
