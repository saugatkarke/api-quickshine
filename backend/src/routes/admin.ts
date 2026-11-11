import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAdminToken } from '../middleware/adminAuth.js'
import { sendResetCodeEmail } from '../utils/email.js'
import { notifyClientOfBookingConfirmation } from '../services/mailer.js'
import { createBookingCalendarEvent, deleteBookingCalendarEvent } from '../services/outlookCalendar.js'
import { isDateNotInPast } from '../utils/date.js'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { validationErrorResponse } from '../utils/validation.js'

const router = Router()

const bookingStatusSchema = z.object({
  status: z.enum(['New', 'Contacted', 'Quoted', 'Booked'])
})

const contactStatusSchema = z.object({
  status: z.enum(['New', 'Contacted', 'Closed'])
})

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

router.use(requireAdminToken)

router.get('/bookings', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, service, property_type, property_size, preferred_date, time_slot, add_ons,
        first_name, last_name, email, phone, street_address, suburb, postcode, notes,
        parking_option, access_option, date_flexible, time_flexible, cleanliness_rating, pricing,
        amount_paid, amount_due, status, outlook_calendar_event_id, created_at, updated_at
      FROM bookings
      ORDER BY created_at DESC`
    )

    res.json({ bookings: result.rows })
  } catch (error) {
    next(error)
  }
})

router.patch('/bookings/:id/status', async (req, res, next) => {
  try {
    const { status } = bookingStatusSchema.parse(req.body)

    const existingResult = await query(
      `SELECT id, service, property_type, property_size, preferred_date, time_slot, add_ons,
              first_name, last_name, email, phone, street_address, suburb, postcode, notes,
              parking_option, access_option, date_flexible, time_flexible, cleanliness_rating, pricing,
              amount_paid, amount_due, status, outlook_calendar_event_id
       FROM bookings WHERE id = $1`,
      [req.params.id]
    )

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found' })
    }

    const previousBooking = existingResult.rows[0]

    const result = await query(
      `UPDATE bookings
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, service, property_type, property_size, preferred_date, time_slot, add_ons,
                first_name, last_name, email, phone, street_address, suburb, postcode, notes,
                parking_option, access_option, date_flexible, time_flexible, cleanliness_rating, pricing,
                amount_paid, amount_due, status, outlook_calendar_event_id, updated_at`,
      [status, req.params.id]
    )

    const updatedBooking = result.rows[0]

    // Send confirmation email to client ONLY if admin sets status to 'Booked'
    // and the booking date is NOT in the past.
    if (status === 'Booked' && previousBooking.status !== 'Booked') {
      const prefDate = updatedBooking.preferred_date
      if (isDateNotInPast(prefDate)) {
        try {
          const formattedDateStr = prefDate instanceof Date
            ? prefDate.toISOString().split('T')[0]
            : String(prefDate).split('T')[0]

          await notifyClientOfBookingConfirmation({
            id: String(updatedBooking.id),
            service: String(updatedBooking.service ?? ''),
            property_type: String(updatedBooking.property_type ?? ''),
            property_size: String(updatedBooking.property_size ?? ''),
            preferred_date: formattedDateStr,
            time_slot: String(updatedBooking.time_slot ?? ''),
            first_name: String(updatedBooking.first_name ?? ''),
            last_name: String(updatedBooking.last_name ?? ''),
            email: String(updatedBooking.email ?? ''),
            phone: String(updatedBooking.phone ?? ''),
            street_address: String(updatedBooking.street_address ?? ''),
            suburb: String(updatedBooking.suburb ?? ''),
            postcode: String(updatedBooking.postcode ?? ''),
            notes: updatedBooking.notes ? String(updatedBooking.notes) : null,
            parking_option: updatedBooking.parking_option ? String(updatedBooking.parking_option) : null,
            access_option: updatedBooking.access_option ? String(updatedBooking.access_option) : null,
            date_flexible: updatedBooking.date_flexible ? String(updatedBooking.date_flexible) : null,
            time_flexible: updatedBooking.time_flexible ? String(updatedBooking.time_flexible) : null,
            cleanliness_rating: updatedBooking.cleanliness_rating ? String(updatedBooking.cleanliness_rating) : null,
            pricing: typeof updatedBooking.pricing === 'object' && updatedBooking.pricing !== null ? updatedBooking.pricing : {},
            amount_paid: updatedBooking.amount_paid ?? null,
            amount_due: updatedBooking.amount_due ?? null,
            add_ons: Array.isArray(updatedBooking.add_ons) ? updatedBooking.add_ons : []
          })
        } catch (emailErr) {
          console.error('[email error] Failed to send client booking confirmation:', emailErr)
        }
      } else {
        console.info(`[email skipped] Status changed to Booked for booking ${updatedBooking.id}, but date ${prefDate} is in the past.`)
      }

      try {
        const eventId = await createBookingCalendarEvent({
          id: String(updatedBooking.id),
          service: String(updatedBooking.service ?? ''),
          property_type: String(updatedBooking.property_type ?? ''),
          property_size: String(updatedBooking.property_size ?? ''),
          preferred_date: updatedBooking.preferred_date,
          time_slot: String(updatedBooking.time_slot ?? ''),
          first_name: String(updatedBooking.first_name ?? ''),
          last_name: String(updatedBooking.last_name ?? ''),
          email: String(updatedBooking.email ?? ''),
          phone: String(updatedBooking.phone ?? ''),
          street_address: String(updatedBooking.street_address ?? ''),
          suburb: String(updatedBooking.suburb ?? ''),
          postcode: String(updatedBooking.postcode ?? ''),
          notes: updatedBooking.notes ? String(updatedBooking.notes) : null
        })

        if (eventId) {
          await query(
            `UPDATE bookings
             SET outlook_calendar_event_id = $1,
                 updated_at = now()
             WHERE id = $2`,
            [eventId, updatedBooking.id]
          )
          updatedBooking.outlook_calendar_event_id = eventId
        }
      } catch (calendarErr) {
        console.error('[calendar error] Failed to create Outlook calendar event:', calendarErr)
      }
    }

    if (previousBooking.status === 'Booked' && status !== 'Booked' && previousBooking.outlook_calendar_event_id) {
      try {
        await deleteBookingCalendarEvent(String(previousBooking.outlook_calendar_event_id))
      } catch (calendarErr) {
        console.error('[calendar error] Failed to delete Outlook calendar event:', calendarErr)
      }

      await query(
        `UPDATE bookings
         SET outlook_calendar_event_id = NULL,
             updated_at = now()
         WHERE id = $1`,
        [updatedBooking.id]
      )
      updatedBooking.outlook_calendar_event_id = null
    }

    return res.json(updatedBooking)
  } catch (error) {
    return next(error)
  }
})

router.get('/contacts', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, subject, message, status, created_at, updated_at
      FROM contact_messages
      ORDER BY created_at DESC`
    )

    res.json({ contacts: result.rows })
  } catch (error) {
    next(error)
  }
})

router.patch('/contacts/:id/status', async (req, res, next) => {
  try {
    const { status } = contactStatusSchema.parse(req.body)
    const result = await query(
      `UPDATE contact_messages
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, status, updated_at`,
      [status, req.params.id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contact message not found' })
    }

    return res.json(result.rows[0])
  } catch (error) {
    return next(error)
  }
})

export default router


