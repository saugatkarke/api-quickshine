ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS parking_option text,
  ADD COLUMN IF NOT EXISTS access_option text,
  ADD COLUMN IF NOT EXISTS date_flexible text,
  ADD COLUMN IF NOT EXISTS cleanliness_rating text;
