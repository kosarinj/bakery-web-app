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

const __dirname = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8')

// Try running schema as one batch; if that fails, run each statement individually
pool.query(schema)
  .then(() => console.log('Database ready'))
  .catch(async err => {
    console.error('Schema batch failed, trying per-statement:', err.message)
    const stmts = schema.split(';').map(s => s.trim()).filter(Boolean)
    for (const stmt of stmts) {
      try { await pool.query(stmt) } catch (e) { console.error(' stmt error:', e.message) }
    }
    console.log('Database ready (per-statement mode)')
  })
