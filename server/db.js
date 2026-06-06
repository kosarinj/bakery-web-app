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
  // Check whether latest migration column exists
  const { rows: recipeCheck } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name='recipes' AND column_name='recipe_id' LIMIT 1`
  )
  if (recipeCheck.length > 0) {
    console.log('Database ready')
    return
  }

  // Check whether base schema exists at all
  const { rows: baseCheck } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name='accounts' AND column_name='adj_level' LIMIT 1`
  )

  if (baseCheck.length === 0) {
    // Fresh database — run full schema
    await pool.query(schema)
    console.log('Database initialized')
  } else {
    // Existing DB — run only the new recipe migrations
    await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS recipe_id INTEGER`)
    await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS space     BOOLEAN DEFAULT FALSE`)
    await pool.query(`ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_product_ingredient_key`)
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_product_ingredient
       ON recipes(product, ingredient) WHERE ingredient IS NOT NULL`
    )
    console.log('Database migrations applied (recipe_id, space, partial index)')
  }
}

initDB().catch(err => console.error('DB init error:', err.message))
