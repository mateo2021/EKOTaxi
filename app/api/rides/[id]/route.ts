import type { NextRequest } from 'next/server'
import { rideProgress } from '@/lib/rides-validation'
import { UNAUTHORIZED, advanceRide, getApiUserId, rideErrorResponse } from '@/lib/rides-service'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/rides/[id]'>) {
  const userId = await getApiUserId()
  if (!userId) return UNAUTHORIZED()
  const { id } = await ctx.params

  try {
    const now = new Date()
    const { ride, driver } = await advanceRide(id, userId, now)
    return Response.json({ ride, driver, progress: rideProgress(ride, now) })
  } catch (e) {
    return rideErrorResponse(e)
  }
}
