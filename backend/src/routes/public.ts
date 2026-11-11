import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { sendResetCodeEmail } from '../utils/email.js'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { validationErrorResponse } from '../utils/validation.js'

import { notifyAdminOfBooking, notifyAdminOfContact, notifyClientOfBookingConfirmation } from '../services/mailer.js'
import { createBookingCalendarEvent } from '../services/outlookCalendar.js'
import { bookingSlotUnavailableMessage, isBookingSlotAvailable } from '../services/bookingAvailability.js'
/* STRIPE DISABLED FOR NOW
import {
  createBookingPaymentIntent,
  getAdvancePaymentAmount,
  getAdvancePaymentAmountCents,
  getStripePublishableKey,
  getStripeCurrency,
  verifySucceededBookingPayment
} from '../services/stripePayment.js'
*/

const router = Router()


const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required')
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateSixDigitCode() {
  return crypto.randomInt(100000, 1000000).toString()
}

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const result = await query(
      `SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1`,
      [email]
    )
    const user = result.rows[0]

    if (!user || !user.is_active || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    )

    return res.json({ token, email: user.email })
  } catch (error) {
    return next(error)
  }
})

// POST /forgot-password - generates a code and emails it
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body)

    const result = await query(`SELECT id, email FROM users WHERE email = $1`, [email])
    const user = result.rows[0]

    // Always return a generic success message, even if the user doesn't exist,
    // so this endpoint can't be used to enumerate valid emails.
    if (!user) {
      return res.json({ message: 'If an account exists for that email, a reset code has been sent.' })
    }

    const code = generateSixDigitCode()
    const codeHash = hashCode(code)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await query(
      `UPDATE users
       SET reset_code_hash = $1,
           reset_code_expires_at = $2,
           updated_at = now()
       WHERE id = $3`,
      [codeHash, expiresAt, user.id]
    )

    await sendResetCodeEmail(user.email, code)

    return res.json({ message: 'If an account exists for that email, a reset code has been sent.' })
  } catch (error) {
    return next(error)
  }
})

// POST /reset-password â€” verify code, set new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body)

    const result = await query(
      `SELECT id, reset_code_hash, reset_code_expires_at FROM users WHERE email = $1`,
      [email]
    )
    const user = result.rows[0]

    if (!user || !user.reset_code_hash || !user.reset_code_expires_at) {
      return res.status(400).json(validationErrorResponse({ code: ['Invalid or expired reset code'] }))
    }

    if (new Date(user.reset_code_expires_at).getTime() < Date.now()) {
      return res.status(400).json(validationErrorResponse({ code: ['Reset code has expired'] }))
    }

    const codeHash = hashCode(code)
    if (codeHash !== user.reset_code_hash) {
      return res.status(400).json(validationErrorResponse({ code: ['Invalid or expired reset code'] }))
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await query(
      `UPDATE users
       SET password_hash = $1,
           reset_code_hash = NULL,
           reset_code_expires_at = NULL,
           updated_at = now()
       WHERE id = $2`,
      [passwordHash, user.id]
    )

    return res.json({ message: 'Password has been reset. You can now log in.' })
  } catch (error) {
    return next(error)
  }
})

const bookingSchema = z.preprocess(
  (val: any) => {
    if (val && typeof val === 'object') {
      const paymentIntentId = val.paymentIntentId || val.payment?.paymentIntentId
      return {
        ...val,
        paymentIntentId
      }
    }
    return val
  },
  z.object({
    service: z.string().min(1),
    propertyType: z.string().min(1),
    propertySize: z.string().min(1),
    date: z.string().min(1),
    timeSlot: z.string().min(1),
    paymentIntentId: z.string().optional(),
    selectedAddOns: z.array(z.string()).default([]),
    payment: z.object({
      provider: z.string().optional(),
      paymentIntentId: z.string().optional()
    }).optional(),
    customer: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(6),
      streetAddress: z.string().min(1),
      suburb: z.string().min(1),
      postcode: z.string().min(3),
      notes: z.string().optional().nullable(),
      parkingOption: z.string().optional().nullable(),
      accessOption: z.string().optional().nullable(),
      dateFlexible: z.string().min(1),
      timeFlexible: z.string().min(1),
      cleanlinessRating: z.string().optional().nullable()
    }),
    pricing: z.object({
      base: z.number(),
      typeFee: z.number(),
      addOnsTotal: z.number(),
      total: z.number(),
      bookingFeePaid: z.number().optional()
    })
  })
)

const paymentIntentSchema = z.object({
  date: z.string().min(1),
  timeSlot: z.string().min(1)
}).passthrough()

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.enum(['booking', 'quote', 'support', 'feedback', 'other']),
  message: z.string().min(1)
})

const availabilityQuerySchema = z.object({
  date: z.string().min(1),
  timeSlot: z.string().min(1)
})

router.get('/health', (_req, res) => {
  res.json({ ok: true })
})

router.get('/bookings/availability', async (req, res, next) => {
  try {
    const { date, timeSlot } = availabilityQuerySchema.parse(req.query)
    const available = await isBookingSlotAvailable(date, timeSlot)
    res.json({ available, message: available ? null : bookingSlotUnavailableMessage })
  } catch (error) {
    next(error)
  }
})

/* STRIPE ENDPOINTS (DISABLED FOR NOW)
router.get('/stripeapikey', (_req, res) => {
  res.status(200).json({
    stripeApiKey: getStripePublishableKey()
  })
})

router.post('/payment/process', async (req, res, next) => {
  try {
    const { date, timeSlot } = paymentIntentSchema.parse(req.body)

    const bookingSlotAvailable = await isBookingSlotAvailable(date, timeSlot)
    if (!bookingSlotAvailable) {
      return res.status(409).json(validationErrorResponse({
        root: [bookingSlotUnavailableMessage],
        date: [bookingSlotUnavailableMessage],
        timeSlot: [bookingSlotUnavailableMessage]
      }))
    }

    const advancePaymentAmount = getAdvancePaymentAmount()
    const paymentIntent = await createBookingPaymentIntent()

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: getAdvancePaymentAmountCents(),
      advancePaymentAmount,
      currency: getStripeCurrency()
    })
  } catch (error) {
    next(error)
  }
})
*/

router.post('/bookings', async (req, res, next) => {
  try {
    const payload = bookingSchema.parse(req.body)

    const bookingSlotAvailable = await isBookingSlotAvailable(payload.date, payload.timeSlot)
    if (!bookingSlotAvailable) {
      return res.status(409).json(validationErrorResponse({
        root: [bookingSlotUnavailableMessage],
        date: [bookingSlotUnavailableMessage],
        timeSlot: [bookingSlotUnavailableMessage]
      }))
    }

    /* STRIPE PREPAYMENT VERIFICATION (DISABLED FOR NOW)
    const advancePaymentAmount = getAdvancePaymentAmount()
    const amountDue = Math.max(payload.pricing.total - advancePaymentAmount, 0)
    const expectedPaymentAmount = getAdvancePaymentAmountCents()

    const paymentVerified = await verifySucceededBookingPayment(payload.paymentIntentId, expectedPaymentAmount)
    if (!paymentVerified) {
      return res.status(402).json(validationErrorResponse({
        root: [`$${advancePaymentAmount} advance payment must be completed before creating a booking.`],
        paymentIntentId: [`$${advancePaymentAmount} advance payment must be completed before creating a booking.`]
      }))
    }
    */

    // Without Stripe prepayment: advance payment is 0 and full total is due
    const advancePaymentAmount = 0
    const amountDue = payload.pricing.total

    const result = await query<{
      id: string
      service: string
      property_type: string
      property_size: string
      preferred_date: string
      time_slot: string
      add_ons: string[]
      first_name: string
      last_name: string
      email: string
      phone: string
      street_address: string
      suburb: string
      postcode: string
      notes: string | null
      parking_option: string | null
      access_option: string | null
      date_flexible: string | null
      time_flexible: string | null
      cleanliness_rating: string | null
      stripe_payment_intent_id: string | null
      amount_paid: string
      amount_due: string
      pricing: {
        total?: number
        base?: number
        typeFee?: number
        addOnsTotal?: number
      }
    }>(
      `INSERT INTO bookings (
        service, property_type, property_size, preferred_date, time_slot, add_ons,
        first_name, last_name, email, phone, street_address, suburb, postcode, notes,
        parking_option, access_option, date_flexible, time_flexible, cleanliness_rating, pricing,
        status, stripe_payment_intent_id, amount_paid, amount_due
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'Booked', $21, $22, $23)
      RETURNING id, service, property_type, property_size, preferred_date, time_slot, add_ons,
        first_name, last_name, email, phone, street_address, suburb, postcode, notes,
        parking_option, access_option, date_flexible, time_flexible, cleanliness_rating,
        stripe_payment_intent_id, amount_paid, amount_due, pricing`,
      [
        payload.service,
        payload.propertyType,
        payload.propertySize,
        payload.date,
        payload.timeSlot,
        JSON.stringify(payload.selectedAddOns),
        payload.customer.firstName,
        payload.customer.lastName,
        payload.customer.email,
        payload.customer.phone,
        payload.customer.streetAddress,
        payload.customer.suburb,
        payload.customer.postcode,
        payload.customer.notes ?? null,
        payload.customer.parkingOption ?? null,
        payload.customer.accessOption ?? null,
        payload.customer.dateFlexible,
        payload.customer.timeFlexible,
        payload.customer.cleanlinessRating ?? null,
        JSON.stringify(payload.pricing),
        payload.paymentIntentId ?? null,
        advancePaymentAmount,
        amountDue
      ]
    )

    const booking = result.rows[0]
    await notifyAdminOfBooking(booking).catch((error) => {
      console.error('Failed to send booking notification email', error)
    })

    await notifyClientOfBookingConfirmation(booking).catch((error) => {
      console.error('Failed to send client booking confirmation email', error)
    })

    try {
      const eventId = await createBookingCalendarEvent({
        id: String(booking.id),
        service: String(booking.service ?? ''),
        property_type: String(booking.property_type ?? ''),
        property_size: String(booking.property_size ?? ''),
        preferred_date: booking.preferred_date,
        time_slot: String(booking.time_slot ?? ''),
        first_name: String(booking.first_name ?? ''),
        last_name: String(booking.last_name ?? ''),
        email: String(booking.email ?? ''),
        phone: String(booking.phone ?? ''),
        street_address: String(booking.street_address ?? ''),
        suburb: String(booking.suburb ?? ''),
        postcode: String(booking.postcode ?? ''),
        notes: booking.notes ? String(booking.notes) : null
      })

      if (eventId) {
        await query(
          `UPDATE bookings
           SET outlook_calendar_event_id = $1,
               updated_at = now()
           WHERE id = $2`,
          [eventId, booking.id]
        )
      }
    } catch (calendarErr) {
      console.error('[calendar error] Failed to create Outlook calendar event:', calendarErr)
    }

    return res.status(201).json({
      id: booking.id,
      status: 'Booked',
      amountPaid: Number(booking.amount_paid),
      amountDue: Number(booking.amount_due)
    })
  } catch (error) {
    next(error)
  }
})

router.post('/contacts', async (req, res, next) => {
  try {
    const payload = contactSchema.parse(req.body)

    const result = await query<{
      id: string
      name: string
      email: string
      phone: string | null
      subject: string
      message: string
    }>(
      `INSERT INTO contact_messages (name, email, phone, subject, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, phone, subject, message`,
      [payload.name, payload.email, payload.phone ?? null, payload.subject, payload.message]
    )

    const message = result.rows[0]
    await notifyAdminOfContact(message).catch((error) => {
      console.error('Failed to send contact notification email', error)
    })

    res.status(201).json({ id: message.id, status: 'New' })
  } catch (error) {
    next(error)
  }
})

export default router


