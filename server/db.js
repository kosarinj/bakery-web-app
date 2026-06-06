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
  const [{ rows: baseCheck }, { rows: recipeCheck }, { rows: tixCheck }] = await Promise.all([
    pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='adj_level' LIMIT 1`),
    pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='recipe_id' LIMIT 1`),
    pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='track_tix' LIMIT 1`),
  ])

  if (!baseCheck.length) {
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

  console.log('Database ready')
}

initDB().catch(err => console.error('DB init error:', err.message))
