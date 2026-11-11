# Quick Shine Backend

Node.js, Express, and PostgreSQL API for Quick Shine bookings, contact messages, admin reads, status updates, and admin email notifications.

## API

- `GET /api/health`
- `GET /api/stripeapikey`
- `POST /api/payment/process`
- `POST /api/bookings`
- `POST /api/contacts`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id/status`
- `GET /api/admin/contacts`
- `PATCH /api/admin/contacts/:id/status`

Admin routes require a login token:

```bash
Authorization: Bearer your-login-token
```

## Local Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

The backend runs on `http://localhost:4000` by default.

## PostgreSQL

Create a database and set `DATABASE_URL` in `.env`.

Example:

```bash
createdb quickshine
```

Then update:

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/quickshine
```

## Email Notifications

Set these values in `.env` so the admin receives an email whenever a booking or contact message is created:

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Quick Shine <no-reply@quickshine.com.au>"
ADMIN_EMAIL=admin@quickshine.com.au
```

If SMTP is not configured, the API still stores submissions and logs the email content during development.

## Stripe Payments

Bookings require a successful Stripe PaymentIntent for the configured advance payment amount.
By default, the backend charges a `$90` advance payment and records the remaining payable amount against the booking.

1. Fetch `GET /api/stripeapikey`.
2. Create a PaymentIntent with `POST /api/payment/process`. The backend sets the payment amount; the frontend should not send the booking total as the Stripe amount.
3. Confirm the card payment in Stripe.js.
4. Submit `POST /api/bookings` with the successful `paymentIntentId`; the API verifies the `$90` payment server-side, stores the booking as `Booked`, records `amount_paid`, and records the remaining `amount_due`.

Configure these values in `.env` or your production secret store:

```bash
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CURRENCY=aud
STRIPE_ADVANCE_AMOUNT=90
```

## Outlook Calendar

When a booking status changes to `Booked`, the API creates an Outlook calendar event and stores the event ID on the booking. When that booking later changes from `Booked` to another status, the API deletes the stored Outlook event.

Configure these values in `.env` or your production secret store:

```bash
OUTLOOK_TENANT_ID=
OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OUTLOOK_CALENDAR_USER=admin@quickshine.com.au
OUTLOOK_CALENDAR_TIME_ZONE=Australia/Sydney
```

The Azure app registration needs Microsoft Graph `Calendars.ReadWrite` application permission with admin consent. Run `npm run db:migrate` after deploying so the `outlook_calendar_event_id` column exists.

## Frontend Integration

Set this in the Next.js app:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

For production, use your hosted backend URL, for example:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.quickshine.com.au/api
```


