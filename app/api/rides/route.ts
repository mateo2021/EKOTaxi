import { parseCreateRideBody } from '@/lib/rides-validation'
import { UNAUTHORIZED, createRide, getApiUserId, rideErrorResponse } from '@/lib/rides-service'

export async function POST(request: Request) {
  const userId = await getApiUserId()
  if (!userId) return UNAUTHORIZED()

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return Response.json({ error: 'Nieprawidłowe dane zamówienia' }, { status: 400 })
  }
  const parsed = parseCreateRideBody(json)
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  try {
    const ride = await createRide(userId, parsed.value, new Date())
    return Response.json({ ride }, { status: 201 })
  } catch (e) {
    return rideErrorResponse(e)
  }
}
