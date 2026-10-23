import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { RideScreen } from '@/components/ride/RideScreen'
import { getSession } from '@/lib/profile-server'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function Home() {
  const { userId, profile } = await getSession()
  if (!userId && isSupabaseConfigured()) redirect('/login')

  return (
    <AppShell>
      <RideScreen defaultClass={profile?.default_class ?? 'economy'} />
    </AppShell>
  )
}
