ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS outlook_calendar_event_id text;
