import 'dotenv/config'

const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    currency: (process.env.STRIPE_CURRENCY ?? 'aud').toLowerCase(),
    advancePaymentAmount: Number(process.env.STRIPE_ADVANCE_AMOUNT ?? 90)
  },
  outlook: {
    tenantId: process.env.OUTLOOK_TENANT_ID,
    clientId: process.env.OUTLOOK_CLIENT_ID,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
    calendarUser: process.env.OUTLOOK_CALENDAR_USER ?? process.env.ADMIN_EMAIL,
    timeZone: process.env.OUTLOOK_CALENDAR_TIME_ZONE ?? 'Australia/Sydney'
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'Quick Shine <no-reply@quickshine.com.au>',
    adminEmail: process.env.ADMIN_EMAIL
  }
}

