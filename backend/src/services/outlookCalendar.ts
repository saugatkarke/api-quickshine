import { config } from '../config.js'

type BookingCalendarEvent = {
  id: string
  service: string
  property_type: string
  property_size: string
  preferred_date: string | Date
  time_slot: string
  first_name: string
  last_name: string
  email: string
  phone: string
  street_address: string
  suburb: string
  postcode: string
  notes: string | null
}

type GraphEventResponse = {
  id?: string
}

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

let cachedToken: {
  accessToken: string
  expiresAt: number
} | null = null

function getOutlookConfig() {
  const { tenantId, clientId, clientSecret, calendarUser, timeZone } = config.outlook

  if (!tenantId || !clientId || !clientSecret || !calendarUser) {
    return null
  }

  return { tenantId, clientId, clientSecret, calendarUser, timeZone }
}

function formatBookingDate(dateVal: string | Date) {
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0]
  }

  return String(dateVal).split('T')[0]
}

function parseTimeSlotStart(time: string) {
  const normalized = time.trim().toLowerCase()
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)

  if (!match) {
    return { hours: 9, minutes: 0 }
  }

  let hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  const meridiem = match[3]

  if (meridiem === 'pm' && hours < 12) {
    hours += 12
  }

  if (meridiem === 'am' && hours === 12) {
    hours = 0
  }

  return { hours, minutes }
}

function buildLocalGraphDateTime(date: string, hours: number, minutes: number) {
  const [year, month, day] = date.split('-').map(Number)
  const dateTime = new Date(Date.UTC(year, month - 1, day, hours, minutes))

  return [
    dateTime.getUTCFullYear(),
    String(dateTime.getUTCMonth() + 1).padStart(2, '0'),
    String(dateTime.getUTCDate()).padStart(2, '0')
  ].join('-') + `T${String(dateTime.getUTCHours()).padStart(2, '0')}:${String(dateTime.getUTCMinutes()).padStart(2, '0')}:00`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEventPayload(booking: BookingCalendarEvent, timeZone: string) {
  const bookingDate = formatBookingDate(booking.preferred_date)
  const startsAt = parseTimeSlotStart(booking.time_slot)
  const endDateTime = new Date(Date.UTC(
    Number(bookingDate.slice(0, 4)),
    Number(bookingDate.slice(5, 7)) - 1,
    Number(bookingDate.slice(8, 10)),
    startsAt.hours,
    startsAt.minutes
  ) + DEFAULT_DURATION_MS)
  const customerName = `${booking.first_name} ${booking.last_name}`.trim()
  const address = `${booking.street_address}, ${booking.suburb} ${booking.postcode}`.trim()
  const notes = booking.notes ?? 'None'

  return {
    subject: `Quick Shine: ${booking.service} - ${customerName}`,
    body: {
      contentType: 'HTML',
      content: [
        `<p><strong>Booking ID:</strong> ${escapeHtml(booking.id)}</p>`,
        `<p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>`,
        `<p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>`,
        `<p><strong>Phone:</strong> ${escapeHtml(booking.phone)}</p>`,
        `<p><strong>Service:</strong> ${escapeHtml(booking.service)}</p>`,
        `<p><strong>Property:</strong> ${escapeHtml(`${booking.property_type} - ${booking.property_size}`)}</p>`,
        `<p><strong>Time slot:</strong> ${escapeHtml(booking.time_slot)}</p>`,
        `<p><strong>Address:</strong> ${escapeHtml(address)}</p>`,
        `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>`
      ].join('')
    },
    start: {
      dateTime: buildLocalGraphDateTime(bookingDate, startsAt.hours, startsAt.minutes),
      timeZone
    },
    end: {
      dateTime: buildLocalGraphDateTime(
        [
          endDateTime.getUTCFullYear(),
          String(endDateTime.getUTCMonth() + 1).padStart(2, '0'),
          String(endDateTime.getUTCDate()).padStart(2, '0')
        ].join('-'),
        endDateTime.getUTCHours(),
        endDateTime.getUTCMinutes()
      ),
      timeZone
    },
    location: {
      displayName: address
    },
    transactionId: `quickshine-booking-${booking.id}`
  }
}

async function graphRequest<T>(url: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Microsoft Graph request failed (${response.status}): ${details}`)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json() as Promise<T>
}

async function getAccessToken() {
  const outlookConfig = getOutlookConfig()
  if (!outlookConfig) {
    throw new Error('Outlook calendar integration is not configured')
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken
  }

  const body = new URLSearchParams({
    client_id: outlookConfig.clientId,
    client_secret: outlookConfig.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  })

  const response = await fetch(
    `https://login.microsoftonline.com/${outlookConfig.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    }
  )

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Microsoft identity token request failed (${response.status}): ${details}`)
  }

  const token = await response.json() as { access_token: string; expires_in: number }
  cachedToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  }

  return cachedToken.accessToken
}

export async function createBookingCalendarEvent(booking: BookingCalendarEvent) {
  const outlookConfig = getOutlookConfig()
  if (!outlookConfig) {
    console.info('[calendar skipped] Outlook calendar integration is not configured.')
    return null
  }

  const event = await graphRequest<GraphEventResponse>(
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(outlookConfig.calendarUser)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(buildEventPayload(booking, outlookConfig.timeZone))
    }
  )

  if (!event?.id) {
    throw new Error('Microsoft Graph did not return an event ID')
  }

  return event.id
}

export async function deleteBookingCalendarEvent(eventId: string) {
  const outlookConfig = getOutlookConfig()
  if (!outlookConfig) {
    console.info('[calendar skipped] Outlook calendar integration is not configured.')
    return
  }

  try {
    await graphRequest<void>(
      `${GRAPH_BASE_URL}/users/${encodeURIComponent(outlookConfig.calendarUser)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('Microsoft Graph request failed (404)')) {
      return
    }

    throw error
  }
}
