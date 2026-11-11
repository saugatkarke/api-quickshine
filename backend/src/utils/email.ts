import nodemailer from 'nodemailer'
import { config } from '../config'
import 'dotenv/config'


const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
})

export async function sendResetCodeEmail(to: string, code: string) {
  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Your password reset code',
    text: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <p>Your password reset code is:</p>
      <h2 style="letter-spacing: 4px;">${code}</h2>
      <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  })
}

// utils/email.ts (add to existing file)
interface StaleBooking {
  id: string
  first_name: string
  last_name: string
  service: string
  status: string
  updated_at: string
}

interface StaleContact {
  id: string
  name: string
  subject: string
  status: string
  updated_at: string
}

export async function sendStaleItemsReminderEmail(
  to: string,
  staleBookings: StaleBooking[],
  staleContacts: StaleContact[]
) {
  if (staleBookings.length === 0 && staleContacts.length === 0) return

  const bookingsByStatus = staleBookings.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1
    return acc
  }, {})

  const contactsByStatus = staleContacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  const bookingCountLines = Object.entries(bookingsByStatus)
    .map(([status, count]) => `<li>${status}: ${count}</li>`)
    .join('')

  const contactCountLines = Object.entries(contactsByStatus)
    .map(([status, count]) => `<li>${status}: ${count}</li>`)
    .join('')

  const bookingListLines = staleBookings
    .map((b) => `<li>#${b.id} — ${b.first_name} ${b.last_name} — ${b.service} — stuck in "${b.status}" since ${new Date(b.updated_at).toLocaleDateString()}</li>`)
    .join('')

  const contactListLines = staleContacts
    .map((c) => `<li>#${c.id} — ${c.name} — ${c.subject} — stuck in "${c.status}" since ${new Date(c.updated_at).toLocaleDateString()}</li>`)
    .join('')

  const html = `
    <h2>Catch-up Reminder: Items Untouched for 2+ Days</h2>

    ${staleBookings.length > 0 ? `
      <h3>Stale Bookings (${staleBookings.length} total)</h3>
      <ul>${bookingCountLines}</ul>
      <h4>Details</h4>
      <ul>${bookingListLines}</ul>
    ` : ''}

    ${staleContacts.length > 0 ? `
      <h3>Stale Contact Messages (${staleContacts.length} total)</h3>
      <ul>${contactCountLines}</ul>
      <h4>Details</h4>
      <ul>${contactListLines}</ul>
    ` : ''}

    <p>Log in to the admin dashboard to update these.</p>
  `

  const text = [
    staleBookings.length > 0 ? `Stale Bookings: ${staleBookings.length}` : '',
    ...Object.entries(bookingsByStatus).map(([s, c]) => `  ${s}: ${c}`),
    staleContacts.length > 0 ? `Stale Contacts: ${staleContacts.length}` : '',
    ...Object.entries(contactsByStatus).map(([s, c]) => `  ${s}: ${c}`),
  ].filter(Boolean).join('\n')

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: `Catch-up needed: ${staleBookings.length + staleContacts.length} item(s) untouched 2+ days`,
    text,
    html,
  })
}