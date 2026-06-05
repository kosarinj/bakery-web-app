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

// Only run schema if the database hasn't been fully migrated yet.
// Check for the last column added (adj_level on accounts).
// On an already-running DB this query returns instantly and skips the migration.
pool.query(`SELECT 1 FROM information_schema.columns
  WHERE table_name='accounts' AND column_name='adj_level' LIMIT 1`)
  .then(({ rows }) => {
    if (rows.length > 0) {
      console.log('Database ready')
      return
    }
    console.log('Running schema initialization...')
    return pool.query(schema)
  })
  .then(() => console.log('Schema OK'))
  .catch(err => console.error('DB init error:', err.message))
