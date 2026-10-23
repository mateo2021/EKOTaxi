export type RideClass = 'economy' | 'comfort' | 'xl'
export type RideStatus = 'searching' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
export type Theme = 'light' | 'dark'
export type ChatStatus = 'pending' | 'done' | 'error'

export interface Profile {
  id: string
  display_name: string | null
  theme: Theme
  default_class: RideClass
  notify_ride_status: boolean
  notify_promos: boolean
  discord_webhook_url: string | null
  is_admin: boolean
}

export interface Driver {
  id: string
  name: string
  car: string
  plate: string
  rating: number
  class: RideClass
}

export interface Ride {
  id: string
  user_id: string
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  dropoff_address: string
  dropoff_lat: number
  dropoff_lng: number
  class: RideClass
  distance_km: number
  price_pln: number
  status: RideStatus
  driver_id: string | null
  last_notified_status: RideStatus | null
  created_at: string
}

export interface Promo {
  id: string
  title: string
  body: string
  created_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  question: string
  answer: string | null
  status: ChatStatus
  created_at: string
  answered_at: string | null
}
