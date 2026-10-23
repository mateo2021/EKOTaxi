'use client'

import { useActionState } from 'react'
import { sendTestNotification, updateProfile, type SettingsState } from './actions'
import type { Profile } from '@/lib/types'

const initial: SettingsState = { error: null, message: null }

const inputClass =
  'w-full rounded-control border border-border bg-bg px-4 py-3 text-base text-text placeholder:text-muted/70 outline-none transition-colors focus:border-accent focus-visible:outline-none focus:ring-2 focus:ring-accent/25'

const choiceClass =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-bg px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-contrast has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent'

const themes = [
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
]
const classes = [
  { value: 'economy', label: 'Ekonomiczna' },
  { value: 'comfort', label: 'Komfort' },
  { value: 'xl', label: 'XL' },
]

export function SettingsForm({ profile }: { profile: Profile }) {
  const [saved, save, saving] = useActionState(updateProfile, initial)
  const [tested, test, testing] = useActionState(sendTestNotification, initial)

  return (
    <form action={save} className="flex flex-col gap-8" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Imię</span>
        <input
          name="display_name"
          required
          maxLength={50}
          defaultValue={profile.display_name ?? ''}
          autoComplete="given-name"
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Motyw</legend>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((t) => (
            <label key={t.value} className={choiceClass}>
              <input
                type="radio"
                name="theme"
                value={t.value}
                defaultChecked={profile.theme === t.value}
                className="sr-only"
                onChange={(e) => {
                  // Podgląd od razu; zapis następuje po „Zapisz zmiany”.
                  document.documentElement.dataset.theme = e.currentTarget.value
                }}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Domyślna klasa przejazdu</legend>
        <div className="grid grid-cols-3 gap-2">
          {classes.map((c) => (
            <label key={c.value} className={choiceClass}>
              <input
                type="radio"
                name="default_class"
                value={c.value}
                defaultChecked={profile.default_class === c.value}
                className="sr-only"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Powiadomienia</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="notify_ride_status"
            defaultChecked={profile.notify_ride_status}
            className="size-5 accent-accent"
          />
          Powiadomienia o statusie kursu
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="notify_promos"
            defaultChecked={profile.notify_promos}
            className="size-5 accent-accent"
          />
          Powiadomienia o promocjach
        </label>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Webhook Discord (opcjonalnie)</span>
        <input
          name="discord_webhook_url"
          type="url"
          inputMode="url"
          maxLength={300}
          defaultValue={profile.discord_webhook_url ?? ''}
          placeholder="https://discord.com/api/webhooks/…"
          className={inputClass}
        />
        <span className="text-sm text-muted">
          Tu wyślemy powiadomienia. Bez niego użyjemy domyślnego kanału, jeśli jest ustawiony.
        </span>
      </label>

      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {saved.error && (
          <p role="alert" className="text-danger">
            {saved.error}
          </p>
        )}
        {saved.message && <p className="text-accent">{saved.message}</p>}
        {tested.error && (
          <p role="alert" className="text-danger">
            {tested.error}
          </p>
        )}
        {tested.message && <p className="text-accent">{tested.message}</p>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="min-h-12 flex-1 cursor-pointer rounded-control bg-accent px-5 font-semibold text-accent-contrast transition-opacity disabled:opacity-60"
        >
          {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
        </button>
        <button
          type="submit"
          formAction={test}
          disabled={testing}
          className="min-h-12 flex-1 cursor-pointer rounded-control border border-border bg-surface px-5 font-medium disabled:opacity-60"
        >
          {testing ? 'Wysyłanie…' : 'Wyślij testowe powiadomienie'}
        </button>
      </div>
    </form>
  )
}
