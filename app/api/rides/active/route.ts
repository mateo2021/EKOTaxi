import { UNAUTHORIZED, findActiveRide, getApiUserId, rideErrorResponse } from '@/lib/rides-service'

export async function GET() {
  const userId = await getApiUserId()
  if (!userId) return UNAUTHORIZED()

  try {
    const active = await findActiveRide(userId, new Date())
    return Response.json({ ride: active?.ride ?? null })
  } catch (e) {
    return rideErrorResponse(e)
  }
}
