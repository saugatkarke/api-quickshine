import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
import { config } from '../config.js'

type BookingEmail = {
  id: string
  service: string
  property_type: string
  property_size: string
  preferred_date: string
  time_slot: string
  first_name: string
  last_name: string
  email: string
  phone: string
  street_address: string
  suburb: string
  postcode: string
  notes: string | null
  parking_option?: string | null
  access_option?: string | null
  date_flexible?: string | null
  time_flexible?: string | null
  cleanliness_rating?: string | null
  pricing: {
    total?: number
    base?: number
    typeFee?: number
    addOnsTotal?: number
  }
  amount_paid?: number | string | null
  amount_due?: number | string | null
  add_ons: string[]
}

type ContactEmail = {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
}

const hasSmtpConfig = Boolean(
  config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.adminEmail
)

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      }
    })
  : null

const escapeHtml = (value: unknown) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const formatMoney = (value: unknown, fallback = 'N/A') => {
  const amount = Number(value)
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : fallback
}

const sendAdminEmail = async (subject: string, text: string, html: string, replyTo?: string) => {
  if (!transporter || !config.smtp.adminEmail) {
    console.info(`[email skipped] ${subject}\n${text}`)
    return
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.adminEmail,
    replyTo,
    subject,
    text,
    html
  })
}

// ── Shared email chrome (header, footer, row helper) ─────────────────

const BRAND_COLOR = '#0ea5a4' // teal — adjust to match your actual brand color
const BRAND_NAME = 'Quick Shine'

type Row = { label: string; value: string; href?: string }

const renderRows = (rows: Row[]) =>
  rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eef0f2; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; width: 140px; vertical-align: top;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eef0f2; color: #111827; font-size: 15px; vertical-align: top;">
            ${row.href ? `<a href="${row.href}" style="color: ${BRAND_COLOR}; text-decoration: none;">${row.value}</a>` : row.value}
          </td>
        </tr>`
    )
    .join('')

const wrapEmail = (opts: {
  eyebrow: string
  heading: string
  intro?: string
  rows: Row[]
  badge?: string
  footerNote?: string
  headerBadge?: string
}) => `
<!DOCTYPE html>
<html>
  <body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="background-color: ${BRAND_COLOR}; padding: 24px 32px;">
                <span style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 0.02em;">
                  ${BRAND_NAME}
                </span>
                <span style="float: right; color: rgba(255,255,255,0.85); font-size: 13px; margin-top: 3px;">
                  ${escapeHtml(opts.headerBadge ?? 'Admin Notification')}
                </span>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 32px;">
                <p style="margin: 0 0 6px; color: ${BRAND_COLOR}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">
                  ${escapeHtml(opts.eyebrow)}
                </p>
                <h1 style="margin: 0 0 ${opts.intro ? '12px' : '20px'}; color: #111827; font-size: 22px; font-weight: 700;">
                  ${escapeHtml(opts.heading)}
                  ${opts.badge ? `<span style="display: inline-block; margin-left: 10px; padding: 3px 10px; background-color: #ecfdf5; color: #047857; font-size: 12px; font-weight: 600; border-radius: 999px; vertical-align: middle;">${escapeHtml(opts.badge)}</span>` : ''}
                </h1>
                ${opts.intro ? `<p style="margin: 0 0 20px; color: #4b5563; font-size: 14px; line-height: 1.5;">${opts.intro}</p>` : ''}

                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                  ${renderRows(opts.rows)}
                </table>

                ${opts.footerNote ? `<p style="margin: 24px 0 0; padding: 14px 16px; background-color: #f9fafb; border-left: 3px solid ${BRAND_COLOR}; border-radius: 4px; color: #4b5563; font-size: 13px; line-height: 1.5;">${opts.footerNote}</p>` : ''}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #eef0f2;">
                <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                  Thank you for choosing ${BRAND_NAME}. If you have any questions, feel free to reply to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`

// ── Booking notification ──────────────────────────────────────────────

export const notifyAdminOfBooking = async (booking: BookingEmail) => {
  const customerName = `${booking.first_name} ${booking.last_name}`
  const address = `${booking.street_address}, ${booking.suburb} ${booking.postcode}`
  const total = booking.pricing.total ? `$${booking.pricing.total}` : 'Not calculated'
  const paid = formatMoney(booking.amount_paid)
  const due = formatMoney(booking.amount_due)
  const addOns = booking.add_ons.length > 0 ? booking.add_ons.join(', ') : 'None'

  const text = [
    'New booking received',
    `Booking ID: ${booking.id}`,
    `Customer: ${customerName}`,
    `Email: ${booking.email}`,
    `Phone: ${booking.phone}`,
    `Service: ${booking.service}`,
    `Property: ${booking.property_type} - ${booking.property_size}`,
    `Date: ${booking.preferred_date}`,
    `Time: ${booking.time_slot}`,
    `Address: ${address}`,
    `Parking: ${booking.parking_option ?? 'Not specified'}`,
    `Home Access: ${booking.access_option ?? 'Not specified'}`,
    `Date Flexible: ${booking.date_flexible ?? 'Not specified'}`,
    `Time Flexible: ${booking.time_flexible ?? 'Not specified'}`,
    `Cleanliness Rating: ${booking.cleanliness_rating ?? 'Not specified'}`,
    `Add-ons: ${addOns}`,
    `Estimated total: ${total}`,
    `Advance paid: ${paid}`,
    `Remaining payable: ${due}`,
    `Notes: ${booking.notes ?? 'None'}`
  ].join('\n')

  const html = wrapEmail({
    headerBadge: 'Admin Notification',
    eyebrow: 'New Booking',
    heading: customerName,
    badge: total !== 'Not calculated' ? total : undefined,
    intro: `A new booking request just came in for <strong>${escapeHtml(booking.service)}</strong>. Reply to this email to reach the customer directly.`,
    rows: [
      { label: 'Booking ID', value: escapeHtml(booking.id) },
      { label: 'Customer', value: escapeHtml(customerName) },
      { label: 'Email', value: escapeHtml(booking.email), href: `mailto:${booking.email}` },
      { label: 'Phone', value: escapeHtml(booking.phone), href: `tel:${booking.phone}` },
      { label: 'Service', value: escapeHtml(booking.service) },
      { label: 'Property', value: escapeHtml(`${booking.property_type} — ${booking.property_size}`) },
      { label: 'Date', value: escapeHtml(booking.preferred_date) },
      { label: 'Time', value: escapeHtml(booking.time_slot) },
      { label: 'Address', value: escapeHtml(address) },
      { label: 'Parking', value: escapeHtml(booking.parking_option ?? 'Not specified') },
      { label: 'Home Access', value: escapeHtml(booking.access_option ?? 'Not specified') },
      { label: 'Date Flexible', value: escapeHtml(booking.date_flexible ?? 'Not specified') },
      { label: 'Time Flexible', value: escapeHtml(booking.time_flexible ?? 'Not specified') },
      { label: 'Cleanliness', value: escapeHtml(booking.cleanliness_rating ?? 'Not specified') },
      { label: 'Add-ons', value: escapeHtml(addOns) },
      { label: 'Est. total', value: escapeHtml(total) },
      { label: 'Advance paid', value: escapeHtml(paid) },
      { label: 'Remaining payable', value: escapeHtml(due) },
      { label: 'Notes', value: escapeHtml(booking.notes ?? 'None') }
    ],
    footerNote: 'Update this booking\'s status in the admin dashboard once you\'ve confirmed it with the customer.'
  })

  await sendAdminEmail(`New booking from ${customerName} — ${booking.service}`, text, html, booking.email)
}

// ── Contact message notification ──────────────────────────────────────

export const notifyAdminOfContact = async (message: ContactEmail) => {
  const text = [
    'New contact message received',
    `Message ID: ${message.id}`,
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    `Phone: ${message.phone ?? 'Not provided'}`,
    `Subject: ${message.subject}`,
    `Message: ${message.message}`
  ].join('\n')

  const html = wrapEmail({
    headerBadge: 'Admin Notification',
    eyebrow: 'New Contact Message',
    heading: message.name,
    badge: message.subject,
    intro: `A visitor submitted the contact form. Reply to this email to respond directly to <strong>${escapeHtml(message.name)}</strong>.`,
    rows: [
      { label: 'Message ID', value: escapeHtml(message.id) },
      { label: 'Name', value: escapeHtml(message.name) },
      { label: 'Email', value: escapeHtml(message.email), href: `mailto:${message.email}` },
      { label: 'Phone', value: escapeHtml(message.phone ?? 'Not provided') },
      { label: 'Subject', value: escapeHtml(message.subject) },
      { label: 'Message', value: escapeHtml(message.message).replace(/\n/g, '<br />') }
    ],
    footerNote: 'Reply directly to this email, or manage this message from the admin dashboard.'
  })

  await sendAdminEmail(`New contact message: ${message.subject} — ${message.name}`, text, html, message.email)
}

// ── Service checklist PDF attachments ──────────────────────────────────

const CHECKLISTS_DIR = path.resolve(__dirname, '..', '..', 'pdf')

// Ordered from most to least specific so substrings like "cleaning" in
// "general-cleaning" don't shadow more specific matches checked later.
const SERVICE_CHECKLIST_RULES: Array<{ match: RegExp; file: string; label: string }> = [
  { match: /end.?of.?lease/i, file: 'Quickshine End of lease Checklist.pdf', label: 'End of Lease Cleaning Checklist' },
  { match: /move.?(in|out)/i, file: 'QuickShine_Move_In_Cleaning_Checklist.pdf', label: 'Move In Move Out Cleaning Checklist' },
  { match: /oven/i, file: 'QuickShine_Oven_Cleaning_Checklist_Design.pdf', label: 'Oven Cleaning Checklist' },
  { match: /bathroom/i, file: 'QuickShine_Bathroom_Cleaning_Checklist(4).pdf', label: 'Bathroom Cleaning Checklist' },
  { match: /carpet/i, file: 'QuickShine_Carpet_Cleaning_Checklist(2).pdf', label: 'Carpet Cleaning Checklist' },
  { match: /upholstery/i, file: 'QuickShine_Upholstery_Cleaning_Checklist_Oven_Style.pdf', label: 'Upholstery Cleaning Checklist' },
  { match: /deep/i, file: 'QuickShine Deep Cleaning Checklist.pdf', label: 'Deep Cleaning Checklist' },
  { match: /general/i, file: 'QuickShine general cleaning checklist.pdf', label: 'General Cleaning Checklist' }
]

const getServiceChecklistAttachment = (service: string) => {
  const rule = SERVICE_CHECKLIST_RULES.find((r) => r.match.test(service))
  if (!rule) return null

  const filePath = path.join(CHECKLISTS_DIR, rule.file)
  if (!fs.existsSync(filePath)) {
    console.warn(`[email] Checklist PDF not found for service "${service}": ${filePath}`)
    return null
  }

  return { filename: `Quick Shine - ${rule.label}.pdf`, path: filePath }
}

// ── Client Booking Confirmation Email ──────────────────────────────────

export const notifyClientOfBookingConfirmation = async (booking: BookingEmail) => {
  const customerName = `${booking.first_name} ${booking.last_name}`.trim()
  const address = `${booking.street_address}, ${booking.suburb} ${booking.postcode}`
  const total = booking.pricing?.total ? `$${booking.pricing.total}` : 'N/A'
  const paid = formatMoney(booking.amount_paid)
  const due = formatMoney(booking.amount_due)
  const addOns = (Array.isArray(booking.add_ons) && booking.add_ons.length > 0)
    ? booking.add_ons.join(', ')
    : 'None'

  const text = [
    `Dear ${customerName || 'Customer'},`,
    '',
    'Your booking with Quick Shine has been successfully confirmed!',
    '',
    '--- BOOKING DETAILS ---',
    `Booking Ref: ${booking.id}`,
    `Customer Name: ${customerName}`,
    `Service: ${booking.service}`,
    `Property: ${booking.property_type} - ${booking.property_size}`,
    `Scheduled Date: ${booking.preferred_date}`,
    `Time Slot: ${booking.time_slot}`,
    `Service Address: ${address}`,
    `Add-ons: ${addOns}`,
    `Total Price: ${total}`,
    `Advance Paid: ${paid}`,
    `Remaining Payable: ${due}`,
    `Notes: ${booking.notes ?? 'None'}`,
    '',
    'If you have any questions or need to make adjustments, feel free to reply directly to this email.',
    '',
    'Thank you for choosing Quick Shine!',
    'The Quick Shine Team'
  ].join('\n')

  const html = wrapEmail({
    headerBadge: 'Booking Confirmed',
    eyebrow: 'Successful Booking Confirmation',
    heading: `Your Booking is Confirmed!`,
    badge: 'CONFIRMED',
    intro: `Dear <strong>${escapeHtml(customerName || 'Customer')}</strong>,<br/><br/>Your cleaning service booking with <strong>${BRAND_NAME}</strong> has been successfully confirmed. Below are your booking details:`,
    rows: [
      { label: 'Booking Ref', value: escapeHtml(booking.id) },
      { label: 'Customer', value: escapeHtml(customerName) },
      { label: 'Email', value: escapeHtml(booking.email) },
      { label: 'Phone', value: escapeHtml(booking.phone) },
      { label: 'Service', value: escapeHtml(booking.service) },
      { label: 'Property', value: escapeHtml(`${booking.property_type} — ${booking.property_size}`) },
      { label: 'Date', value: escapeHtml(booking.preferred_date) },
      { label: 'Time Slot', value: escapeHtml(booking.time_slot) },
      { label: 'Address', value: escapeHtml(address) },
      { label: 'Add-ons', value: escapeHtml(addOns) },
      { label: 'Total Price', value: escapeHtml(total) },
      { label: 'Advance Paid', value: escapeHtml(paid) },
      { label: 'Remaining Payable', value: escapeHtml(due) },
      { label: 'Notes', value: escapeHtml(booking.notes ?? 'None') }
    ],
    footerNote: 'We look forward to providing you with a sparkling clean experience! If you need to make any changes, please reply directly to this email.'
  })

  const attachment = getServiceChecklistAttachment(booking.service)

  if (!transporter) {
    console.info(`[email skipped - no SMTP config] Client Confirmation to ${booking.email}:\n${text}`)
    return
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: booking.email,
    subject: `Booking Confirmed: Your ${booking.service} on ${booking.preferred_date}`,
    text,
    html,
    attachments: attachment ? [attachment] : undefined
  })
}
