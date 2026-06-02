import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bakery',
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
})

export const query = (text, params) => pool.query(text, params)
export default pool
