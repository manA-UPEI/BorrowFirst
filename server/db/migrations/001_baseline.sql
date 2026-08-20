-- Baseline schema: the state server/db/init.js used to create on every boot.
--
-- Every statement is idempotent (IF NOT EXISTS / DROP IF EXISTS) so this file is
-- safe to apply to an already-deployed database that predates the migration
-- runner: it converges to the same shape and then never runs again.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  "Product_ID" SERIAL PRIMARY KEY,
  "Product_Name" TEXT NOT NULL,
  "Product_Lender_ID" INTEGER NOT NULL,
  "Product_Borrower_ID" INTEGER NULL,
  "Product_Is_Active" INTEGER NOT NULL DEFAULT 1,
  "Product_Description" TEXT,
  "Product_Condition" TEXT,
  "Product_Url" TEXT,
  "Product_Lending_Charge" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  cloudinary_public_id TEXT,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickup_options (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  option_index INTEGER NOT NULL,
  location TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  rater_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  lender_id INTEGER NOT NULL,
  borrower_id INTEGER NOT NULL,
  pickup_option INTEGER NOT NULL,
  pickup_meetup_at TIMESTAMP,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approval_expires_at TIMESTAMPTZ,
  pickup_code_hash TEXT,
  pickup_code_expires_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  pickup_verified_by_user_id INTEGER,
  return_meetup_at TIMESTAMP,
  return_code_hash TEXT,
  return_code_expires_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  returned_by_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);
