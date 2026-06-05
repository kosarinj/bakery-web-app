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

// Run each schema statement individually so one failure doesn't abort the rest
const __dirname = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8')

const statements = schema
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0)

;(async () => {
  for (const stmt of statements) {
    try {
      await pool.query(stmt)
    } catch (e) {
      console.error('Schema error:', e.message, '\n  Statement:', stmt.slice(0, 80))
    }
  }
  console.log('Database ready')
})()
