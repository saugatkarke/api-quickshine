import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { ZodError } from 'zod'
import { config } from './config.js'
import { pool } from './db/pool.js'
import adminRoutes from './routes/admin.js'
import publicRoutes from './routes/public.js'
import { seedAdminUser } from './db/seedAdmin.js'
import userRoutes from './routes/userRoutes.js'
import { startStaleItemsReminderJob } from './jobs/staleItemsReminderJob.js'
import { formatZodFieldErrors, validationErrorResponse } from './utils/validation.js'

const app = express()

app.use(helmet())
app.use(cors());
app.use(express.json({ limit: '1mb' }))
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

app.use('/api', publicRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/adminusers', userRoutes)
app.get("/ping", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next

  if (error instanceof ZodError) {
    return res.status(400).json({
      ...validationErrorResponse(formatZodFieldErrors(error)),
      details: error.flatten()
    })
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    if ('constraint' in error && error.constraint === 'bookings_stripe_payment_intent_id_idx') {
      return res.status(409).json(validationErrorResponse({
        paymentIntentId: ['This payment has already been used for another booking.']
      }))
    }

    return res.status(409).json(validationErrorResponse({
      email: ['A user with this email already exists']
    }))
  }

  console.error(error)
  return res.status(500).json({ error: 'Internal server error' })
}

app.use(errorHandler)

async function start() {
  // await seedAdminUser()

 const PORT = Number(process.env.PORT || 3000);

console.log("PORT =", process.env.PORT);
console.log("NODE_ENV =", process.env.NODE_ENV);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on 0.0.0.0:${PORT}`);
});

  startStaleItemsReminderJob()

  const shutdown = async () => {
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

