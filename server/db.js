import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bakery'
const isRemote = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export const query = (text, params) => pool.query(text, params)
export default pool

const __dirname = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8')

async function initDB() {
  // Check which migrations are already applied
  const [{ rows: baseCheck }, { rows: recipeCheck }, { rows: tixCheck }, { rows: specCheck }] = await Promise.all([
    pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='adj_level' LIMIT 1`),
    pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='recipe_id' LIMIT 1`),
    pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='track_tix' LIMIT 1`),
    pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='spec_orders' LIMIT 1`),
  ])

  if (!baseCheck.length || !specCheck.length) {
    // Fresh database — run full schema
    await pool.query(schema)
    console.log('Database initialized')
    return
  }

  // Existing DB — run only what's missing
  if (!recipeCheck.length) {
    await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_id INTEGER`)
    await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS space BOOLEAN DEFAULT FALSE`)
    await pool.query(`ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_product_ingredient_key`)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_product_ingredient ON recipes(product, ingredient) WHERE ingredient IS NOT NULL`)
    console.log('Applied: recipe_id, space columns')
  }

  if (!tixCheck.length) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS track_tix (
        id          SERIAL PRIMARY KEY,
        tix_date    DATE NOT NULL,
        account     TEXT REFERENCES accounts(name) ON UPDATE CASCADE,
        total       NUMERIC(10,2) DEFAULT 0,
        paid        NUMERIC(10,2) DEFAULT 0,
        notes       TEXT,
        last_update TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tix_date, account)
      )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_track_tix_date    ON track_tix(tix_date DESC)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_track_tix_account ON track_tix(account)`)
    console.log('Applied: track_tix table')
  }

  // Unique index on spec_orders.order_num (mirrors daily_orders pattern)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_orders_order_num ON spec_orders(order_num) WHERE order_num IS NOT NULL`)

  // is_extra flag on products — marks products that belong to the "extras" category
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT FALSE`)

  // order_group on accounts — optional label to group several stores (e.g. "Adams")
  // so their orders can be aggregated into one on the Orders screen.
  await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS order_group TEXT`)

  // checked flag on spec_orders — per-order checkbox (defaults checked); replaces destructive delete
  await pool.query(`ALTER TABLE spec_orders ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT TRUE`)

  // Account on spec_orders is now just a mirror of Location (the UI dropped the Account field),
  // so drop the FK to accounts(name) — account holds the location value, which may not be an account.
  await pool.query(`ALTER TABLE spec_orders DROP CONSTRAINT IF EXISTS spec_orders_account_fkey`)

  // Daily inventory — end-of-day location scanning (Left/Return counts per delivery stop)
  const { rows: diCheck } = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='daily_inventory' LIMIT 1`)
  if (!diCheck.length) {
    await pool.query(`
      CREATE TABLE daily_inventory (
        id          SERIAL PRIMARY KEY,
        location    TEXT NOT NULL,
        inv_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        prod_name   TEXT REFERENCES products(prod_name) ON UPDATE CASCADE,
        scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_qty    NUMERIC(10,2) DEFAULT 0,
        return_qty  NUMERIC(10,2) DEFAULT 0,
        override    BOOLEAN DEFAULT FALSE
      )
    `)
    await pool.query(`CREATE UNIQUE INDEX idx_daily_inv_uniq ON daily_inventory(location, inv_date, prod_name, scanned_at)`)
    await pool.query(`CREATE INDEX idx_daily_inv_date     ON daily_inventory(inv_date DESC)`)
    await pool.query(`CREATE INDEX idx_daily_inv_location ON daily_inventory(location)`)
    console.log('Applied: daily_inventory table')
  }

  // special_ords on daily_orders was wrongly defined BOOLEAN (legacy Access flag), but the app
  // uses it as a numeric count of special-order units (spec-order sync adds/subtracts unit deltas,
  // and the copy/repeat query subtracts it from total units). Convert to NUMERIC if still boolean.
  const { rows: soCheck } = await pool.query(
    `SELECT data_type FROM information_schema.columns WHERE table_name='daily_orders' AND column_name='special_ords' LIMIT 1`
  )
  if (soCheck.length && soCheck[0].data_type === 'boolean') {
    await pool.query(`ALTER TABLE daily_orders ALTER COLUMN special_ords DROP DEFAULT`)
    await pool.query(`ALTER TABLE daily_orders ALTER COLUMN special_ords TYPE NUMERIC(10,2) USING (CASE WHEN special_ords THEN 1 ELSE 0 END)`)
    await pool.query(`ALTER TABLE daily_orders ALTER COLUMN special_ords SET DEFAULT 0`)
    console.log('Applied: daily_orders.special_ords boolean -> numeric')
  }

  // Indexes for daily_orders — critical once the table has millions of historical rows
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_orders_ordr_dt  ON daily_orders(ordr_dt)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_orders_account  ON daily_orders(account)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_orders_del_date ON daily_orders(del_date)`)

  // Expression indexes on TRIM(account) / TRIM(name).
  //
  // Account comparisons are trimmed on both sides now, because names carry stray
  // whitespace from the Access import and an exact match silently drops rows.
  // But TRIM(account) can't use an index on the raw account column — Postgres
  // only matches an index whose key is the same expression the query uses — so
  // the trimmed comparisons turned into full table scans of daily_orders and
  // track_tix. These restore index access without going back to the exact match.
  //
  // btrim() is immutable, so it is legal in an index key.
  //
  // An expression index needs its own ANALYZE before the planner has statistics
  // for the expression, so create-then-analyze, and only on the boot that
  // actually creates them — not on every restart.
  const { rows: trimIdx } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE indexname IN
       ('idx_daily_orders_account_trim','idx_track_tix_account_trim','idx_accounts_name_trim')`
  )
  if (trimIdx.length < 3) {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_orders_account_trim ON daily_orders((TRIM(account)))`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_track_tix_account_trim    ON track_tix((TRIM(account)))`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounts_name_trim        ON accounts((TRIM(name)))`)
    await pool.query(`ANALYZE daily_orders`)
    await pool.query(`ANALYZE track_tix`)
    await pool.query(`ANALYZE accounts`)
    console.log('Applied: TRIM(account) expression indexes')
  }

  // Special orders is the largest table in the app, and the Special Orders screen
  // hits it with three queries that no existing index covers: DISTINCT location on
  // every mount, and the stale-delivery check on every date change.
  //
  // The partial index's predicate matches STALE_DELIVERY_WHERE in server/index.js
  // exactly — if that condition changes, this predicate has to change with it or
  // the planner quietly stops using it.
  const { rows: specIdx } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE indexname IN
       ('idx_spec_orders_location','idx_spec_orders_stale_del')`
  )
  if (specIdx.length < 2) {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spec_orders_location ON spec_orders(location)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spec_orders_stale_del
                      ON spec_orders(ordr_dt) WHERE del_date IS NOT NULL AND del_date < ordr_dt`)
    await pool.query(`ANALYZE spec_orders`)
    console.log('Applied: spec_orders location / stale-delivery indexes')
  }

  // Price lists (categories).
  //
  // The prices table has always been keyed (prod_name, category), so more than
  // one price list was possible in the data from the start — the UI just pinned
  // everything to 'wholesale'. The old VB6 program worked exactly this way: a
  // price list per account category (GREEN MARKET, REGULAR, FILL THE BASKET,
  // HOP), each holding both a wholesale and a retail price per product.
  //
  // This table exists so a list can be created and named before it has any
  // prices in it. Deriving the list from DISTINCT prices.category instead would
  // mean a brand-new list vanished on reload until someone typed a price into it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_categories (
      name       TEXT PRIMARY KEY,
      sort_order INTEGER DEFAULT 0,
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Seed from whatever is already in use, so imported lists appear on first run
  // rather than having to be re-created by hand. TRIM for the same reason every
  // other account comparison does: the Access import leaves padded values.
  await pool.query(`
    INSERT INTO price_categories(name)
    SELECT DISTINCT TRIM(category) FROM prices
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    UNION
    SELECT DISTINCT TRIM(category) FROM accounts
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    ON CONFLICT (name) DO NOTHING
  `)
  // A database with no prices yet still needs one list to put prices into.
  await pool.query(`INSERT INTO price_categories(name) VALUES ('wholesale') ON CONFLICT (name) DO NOTHING`)

  // Activity log table
  const { rows: logCheck } = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='activity_log' LIMIT 1`)
  if (!logCheck.length) {
    await pool.query(`
      CREATE TABLE activity_log (
        id         SERIAL PRIMARY KEY,
        username   TEXT,
        action     TEXT NOT NULL,
        details    TEXT,
        ip         TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`CREATE INDEX idx_activity_log_created  ON activity_log(created_at DESC)`)
    await pool.query(`CREATE INDEX idx_activity_log_username ON activity_log(username)`)
    console.log('Applied: activity_log table')
  }

  // Mark stub accounts inactive: those created by historical imports with no route/acctgrp/balance data
  // Uses ON CONFLICT DO NOTHING trick — just sets active=false for bare stubs
  const { rowCount } = await pool.query(`
    UPDATE accounts SET active = false
    WHERE active = true
      AND route IS NULL
      AND sequence = 0
      AND (acctgrp IS NULL OR acctgrp = '')
      AND balance = 0
      AND marketfee = 0
      AND (notes IS NULL OR notes = '')
      AND NOT EXISTS (
        SELECT 1 FROM daily_orders WHERE account = accounts.name LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM track_tix WHERE account = accounts.name LIMIT 1
      )
  `)
  if (rowCount > 0) console.log(`Marked ${rowCount} stub accounts inactive`)

  // ─── Legacy special orders: customer name was stored in `account` ──────────
  // Old Access imports put the walk-in customer (spec_ord.cust) into
  // spec_orders.account, which forced a junk stub row into `accounts` for every
  // person who ever ordered a cake. The Location is the real account. Move the
  // person to cust_name and promote location into account.
  // Self-limiting: once a row is fixed, account = location so it stops matching.
  // Guarantee the column exists here — index.js adds it too, but that runs
  // independently and may not have landed yet.
  await pool.query(`ALTER TABLE spec_orders ADD COLUMN IF NOT EXISTS cust_name text`)
  const legacySpec = `
    cust_name IS NULL
    AND location IS NOT NULL AND btrim(location) <> ''
    AND account IS DISTINCT FROM btrim(location)
  `
  // The account column is FK'd to accounts(name), so the locations must exist first.
  await pool.query(`
    INSERT INTO accounts(name, active)
    SELECT DISTINCT btrim(location), false FROM spec_orders WHERE ${legacySpec}
    ON CONFLICT DO NOTHING
  `)
  const { rowCount: specFixed } = await pool.query(`
    UPDATE spec_orders
       SET cust_name = account,
           account   = btrim(location)
     WHERE ${legacySpec}
  `)
  if (specFixed > 0) console.log(`Moved ${specFixed} legacy special orders onto their Location account`)

  console.log('Database ready')
}

initDB().catch(err => console.error('DB init error:', err.message))
