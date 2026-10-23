import type { NextRequest } from 'next/server'
import { UNAUTHORIZED, cancelRide, getApiUserId, rideErrorResponse } from '@/lib/rides-service'

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/rides/[id]/cancel'>) {
  const userId = await getApiUserId()
  if (!userId) return UNAUTHORIZED()
  const { id } = await ctx.params

  try {
    const ride = await cancelRide(id, userId, new Date())
    return Response.json({ ride })
  } catch (e) {
    return rideErrorResponse(e)
  }
}
