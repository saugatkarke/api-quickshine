import { query } from '../db/pool.js'

export const MAX_BOOKING_REQUESTS_PER_SLOT = 2

export const bookingSlotUnavailableMessage = `The time slot on this date has been booked. Please choose another date or time.`

export function formatBookingDate(dateVal: string | Date) {
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0]
  }

  return String(dateVal).split('T')[0]
}

export async function countBookingRequestsForSlot(date: string | Date, timeSlot: string) {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM bookings
     WHERE preferred_date = $1::date
       AND time_slot = $2`,
    [formatBookingDate(date), timeSlot]
  )

  return Number(result.rows[0]?.count ?? 0)
}

export async function isBookingSlotAvailable(date: string | Date, timeSlot: string) {
  const bookingRequestCount = await countBookingRequestsForSlot(date, timeSlot)
  return bookingRequestCount < MAX_BOOKING_REQUESTS_PER_SLOT
}
