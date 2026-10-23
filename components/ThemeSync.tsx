'use client'

import { useEffect } from 'react'
import type { Theme } from '@/lib/types'

/**
 * Serwer ustawia data-theme na <html> (bez migania). Po zapisaniu ustawień
 * revalidatePath odświeża layout; ten komponent tylko pilnuje, by atrybut
 * zawsze zgadzał się z profilem (także po podglądzie niezapisanego wyboru).
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return null
}
