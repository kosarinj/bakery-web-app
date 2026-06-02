import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bakery'
const isRemote = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isRemote ? { rejectUnauthorized: false } : false
})

export const query = (text, params) => pool.query(text, params)
export default pool

// Auto-run schema on startup (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING)
const __dirname = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8')

pool.query(schema)
  .then(() => console.log('Database ready'))
  .catch(err => console.error('Schema init error:', err.message))
