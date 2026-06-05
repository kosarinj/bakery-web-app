-- Bakery Web App — PostgreSQL Schema
-- Run once to set up the database

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  setting TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (setting, value) VALUES
  ('bakery_name', 'Bakery'),
  ('baking_date', CURRENT_DATE::TEXT)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS accounts (
  name TEXT PRIMARY KEY,
  route TEXT,
  sequence INTEGER DEFAULT 0,
  category TEXT DEFAULT 'wholesale',
  acctgrp TEXT,
  balance NUMERIC(10,2) DEFAULT 0,
  marketfee NUMERIC(10,2) DEFAULT 0,
  prefix TEXT,
  postord BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  prod_name TEXT PRIMARY KEY,
  prod_type TEXT,
  prod_group TEXT,
  barcode TEXT,
  multiplier NUMERIC(10,4) DEFAULT 1,
  divisor NUMERIC(10,4) DEFAULT 1,
  batch BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
  prod_name TEXT PRIMARY KEY REFERENCES products(prod_name) ON UPDATE CASCADE,
  units NUMERIC(10,2) DEFAULT 0,
  sod_inv NUMERIC(10,2) DEFAULT 0,
  location TEXT,
  lst_updt TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  prod_name TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  category TEXT DEFAULT 'wholesale',
  whole_price NUMERIC(10,4) DEFAULT 0,
  ret_price NUMERIC(10,4) DEFAULT 0,
  last_update TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prod_name, category)
);

CREATE TABLE IF NOT EXISTS account_prices (
  account TEXT REFERENCES accounts(name) ON UPDATE CASCADE,
  prod_name TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  whole_price NUMERIC(10,4),
  ret_price NUMERIC(10,4),
  last_update TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (account, prod_name)
);

CREATE TABLE IF NOT EXISTS daily_orders (
  id SERIAL PRIMARY KEY,
  prod_name TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  account TEXT REFERENCES accounts(name) ON UPDATE CASCADE,
  units NUMERIC(10,2) DEFAULT 0,
  wprice NUMERIC(10,4) DEFAULT 0,
  rprice NUMERIC(10,4) DEFAULT 0,
  ordr_dt DATE DEFAULT CURRENT_DATE,
  del_date DATE,
  special_ords BOOLEAN DEFAULT FALSE,
  postbake_adj NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  last_update TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_orders_date ON daily_orders(ordr_dt);
CREATE INDEX IF NOT EXISTS idx_daily_orders_account ON daily_orders(account);
CREATE INDEX IF NOT EXISTS idx_daily_orders_product ON daily_orders(prod_name);

CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  product TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  ingredient TEXT REFERENCES ingredients(name) ON UPDATE CASCADE,
  sequence INTEGER DEFAULT 0,
  teaspoons NUMERIC(10,4) DEFAULT 0,
  tablespoons NUMERIC(10,4) DEFAULT 0,
  cups NUMERIC(10,4) DEFAULT 0,
  pounds NUMERIC(10,4) DEFAULT 0,
  rec_group BOOLEAN DEFAULT FALSE,
  qty NUMERIC(10,4) DEFAULT 0,
  rectext TEXT,
  last_update TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product, ingredient)
);

CREATE TABLE IF NOT EXISTS bake_list (
  id SERIAL PRIMARY KEY,
  prod_name TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  units NUMERIC(10,2) DEFAULT 0,
  bake_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  last_update TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bake_list_date ON bake_list(bake_date);

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  prod_name TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
  account TEXT REFERENCES accounts(name) ON UPDATE CASCADE,
  units NUMERIC(10,2) DEFAULT 0,
  return_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default admin user (password: admin — change immediately)
-- bcrypt hash of 'admin'
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2a$10$vtOaNw1pAbFHKsKM5jP1cuDUDeUucg3PTPg95StZX1XgcQdyTWJWK', 'admin')
ON CONFLICT DO NOTHING;

-- ─── Migrations: extend prices table ─────────────────────────────────────────
ALTER TABLE prices ADD COLUMN IF NOT EXISTS price_id INTEGER;

-- ─── Migrations: extend products table with all Access columns ───────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS prod_id       INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS upc_code      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label1        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label2        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label3        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight        NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS color1        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color2        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color3        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subtype       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingsize       NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS labelsize     NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weightsize    NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingheight     NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS whichlabel    TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS labor_weight  NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS webtype       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gluten_free   BOOLEAN DEFAULT FALSE;

-- ─── Migrations: extend accounts table with all Access columns ──────────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS acct_id       INTEGER;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subcategory   TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS open_dt       DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS manager       TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner         TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address       TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS city          TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS state         TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone         TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS fax           TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS del_inst      TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entire_inv    BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS wrap_muffins  BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS print_inv     BOOLEAN DEFAULT TRUE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_del      DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS gas           NUMERIC(10,2) DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tolls         NUMERIC(10,2) DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS region        TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS day_of_week   TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS webname       TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sendweb       BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS webstart      DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS webend        DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS adj_level     INTEGER DEFAULT 0;
