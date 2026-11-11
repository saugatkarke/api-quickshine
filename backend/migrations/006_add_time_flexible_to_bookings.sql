ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS time_flexible text;
