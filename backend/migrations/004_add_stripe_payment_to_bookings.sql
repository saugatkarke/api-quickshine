ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_id_idx
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
