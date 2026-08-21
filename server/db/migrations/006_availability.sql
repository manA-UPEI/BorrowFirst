-- Availability windows and date-range bookings.
--
-- Until now a listing was either free or not, decided by products."Product_Borrower_ID",
-- and a request carried only a due date -- the loan implicitly started whenever the
-- pickup happened. That cannot express "available over reading week, except the
-- weekend", and it cannot detect that two requests want the same item on overlapping
-- days.

CREATE TABLE IF NOT EXISTS product_availability (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products("Product_ID") ON DELETE CASCADE,
  -- 'available' marks a window the lender is willing to lend in; 'blackout' carves
  -- days back out of it. A product with no 'available' row is treated as available
  -- at any time, which is what every listing created before this migration means.
  kind TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_availability
  ADD CONSTRAINT chk_product_availability_range CHECK (end_date >= start_date);

ALTER TABLE product_availability
  ADD CONSTRAINT chk_product_availability_kind CHECK (kind IN ('available', 'blackout'));

CREATE INDEX IF NOT EXISTS idx_product_availability_product
  ON product_availability(product_id, kind, start_date);

-- A loan now spans [start_date, due_date] rather than ending at an untethered due
-- date, so overlapping bookings become detectable.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS start_date DATE;

-- Existing loans started when they were picked up; for ones that never reached
-- pickup, the request date is the closest honest answer.
UPDATE notifications
SET start_date = CAST(pickup_meetup_at AS DATE)
WHERE start_date IS NULL
  AND pickup_meetup_at IS NOT NULL;

UPDATE notifications
SET start_date = CAST(created_at AS DATE)
WHERE start_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_product_dates
  ON notifications(product_id, status, start_date, due_date);
