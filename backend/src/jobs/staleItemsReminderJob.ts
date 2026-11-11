import cron from 'node-cron'
import { query } from '../db/pool.js'
import { sendStaleItemsReminderEmail } from '../utils/email.js'
import { config } from '../config.js'

interface StaleBookingRow {
  id: string
  first_name: string
  last_name: string
  service: string
  status: string
  updated_at: string
}

interface StaleContactRow {
  id: string
  name: string
  subject: string
  status: string
  updated_at: string
}

export async function runStaleItemsCheck() {
  const adminEmail = config.smtp.adminEmail
  if (!adminEmail) {
    console.warn('ADMIN_EMAIL not set — skipping stale items reminder job')
    return
  }

  // "Not updated in 2 days" AND not already in a final/closed state.
  // Booked bookings and Closed contacts don't need chasing.
  const [staleBookingsResult, staleContactsResult] = await Promise.all([
    query<StaleBookingRow>(
      `SELECT id, first_name, last_name, service, status, updated_at
       FROM bookings
       WHERE status != 'Booked'
         AND updated_at < now() - interval '2 days'
       ORDER BY updated_at ASC`
    ),
    query<StaleContactRow>(
      `SELECT id, name, subject, status, updated_at
       FROM contact_messages
       WHERE status != 'Closed'
         AND updated_at < now() - interval '2 days'
       ORDER BY updated_at ASC`
    ),
  ])

  const staleBookings = staleBookingsResult.rows
  const staleContacts = staleContactsResult.rows

  if (staleBookings.length === 0 && staleContacts.length === 0) {
    console.log('Stale items check: nothing untouched for 2+ days')
    return
  }

  await sendStaleItemsReminderEmail(adminEmail, staleBookings, staleContacts)
  console.log(
    `Stale items reminder sent: ${staleBookings.length} booking(s), ${staleContacts.length} contact(s)`
  )
}

export function startStaleItemsReminderJob() {
  // Runs once a day at 9am server time
  cron.schedule('0 9 * * *', () => {
    runStaleItemsCheck().catch((error) => {
      console.error('Stale items reminder job failed', error)
    })
  })

  console.log('Stale items reminder job scheduled (daily at 9am)')
}