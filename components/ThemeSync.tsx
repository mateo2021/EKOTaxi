'use client'

import { useEffect } from 'react'
import type { Theme } from '@/lib/types'

/**
 * Serwer ustawia data-theme na <html> (bez migania). Po zapisaniu ustawień
 * revalidatePath odświeża layout; ten komponent tylko pilnuje, by atrybut
 * zgadzał się z profilem po każdej zmianie motywu w profilu. Cofnięcie niezapisanego
 * podglądu robi formularz ustawień przy odmontowaniu.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return null
}
