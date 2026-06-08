/**
 * Import data directly from recipe.mdb into the Railway PostgreSQL database.
 *
 * Usage:
 *   node scripts/import-from-access.mjs [path/to/recipe.mdb] [options]
 *
 * Options:
 *   --history   Also import all ordershist tables (3M+ rows — slow, uses ~4GB RAM)
 *   --extras    Also import extras + extrashist tables (850K rows)
 *   --dry-run   Parse and validate but don't write to the database
 *
 * Requires DATABASE_URL in .env (your Railway connection string).
 */

import 'dotenv/config'
import pg from 'pg'
import {
  openMDB, makeTableGetter, getTableInfo, KNOWN_TABLES, IMPORTERS,
  mstr, mnum, mbool, midate, mordnum,
} from '../server/mdb-import.js'

const { Pool } = pg

const args      = process.argv.slice(2)
const MDB_PATH  = args.find(a => !a.startsWith('--')) || 'C:/Users/jeffk/Documents/recipe.mdb'
const DO_HIST   = args.includes('--history')
const DO_EXTRAS = args.includes('--extras')
const DRY_RUN   = args.includes('--dry-run')

if (!process.env.DATABASE_URL && !DRY_RUN) {
  console.error('ERROR: DATABASE_URL not set.')
  console.error('Create a .env file in the project root with:')
  console.error('  DATABASE_URL=postgresql://...(copy from Railway Variables tab)...')
  process.exit(1)
}

const pool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
}) : null
const q = (text, params) => pool.query(text, params)

// ── Open MDB ──────────────────────────────────────────────────────────────────
console.log(`\nReading ${MDB_PATH} ...`)
const db  = openMDB(MDB_PATH)
const tbl = makeTableGetter(db)
console.log(`  Found ${db.getTableNames().length} tables\n`)

if (DRY_RUN) {
  console.log('=== DRY RUN — no data will be written ===\n')
  const info = getTableInfo(db)
  info.forEach(t => {
    console.log(`  ${t.label.padEnd(16)} ${String(t.found ? t.rows : 'NOT FOUND').padStart(8)} rows`)
  })
  console.log('\nDone (dry run). Remove --dry-run to import for real.')
  process.exit(0)
}

// ── Core tables ───────────────────────────────────────────────────────────────
for (const [i, t] of KNOWN_TABLES.entries()) {
  process.stdout.write(`${i+1}/${KNOWN_TABLES.length}  ${t.label} ...`)
  try {
    const n = await IMPORTERS[t.key](tbl, q)
    console.log(`  → ${n.toLocaleString()} rows`)
  } catch (e) {
    console.log(`  ERROR: ${e.message}`)
  }
}

// ── Optional: order history ───────────────────────────────────────────────────
if (DO_HIST) {
  const histTables = [
    'ordershist','ordershist2','ordershist3',
    'ordershist_asof_20170825','ordershist050816',
    'daily_ord_bk','daily_ord','daily_ord_20201214','daily_ord_20201215','dily_ord_20201027',
  ]
  console.log(`\nOrder history (${histTables.length} tables) — this may take several minutes...`)

  for (const tname of histTables) {
    const rows = tbl(tname).map(r => ({
      order_num:    mordnum(r.order_num),
      account:      mstr(r.account),
      ordr_dt:      midate(r.ordr_dt),
      prod_name:    mstr(r.prod_name),
      units:        mnum(r.units) ?? 0,
      wprice:       mnum(r.wprice) ?? 0,
      rprice:       mnum(r.rprice) ?? 0,
      del_date:     midate(r.del_date),
      special_ords: mbool(r.special_ords),
      postbake_adj: mnum(r.postbake_adj) ?? 0,
    })).filter(r => r.account && r.ordr_dt && r.prod_name)

    if (!rows.length) { console.log(`  ${tname}: empty`); continue }
    process.stdout.write(`  ${tname} (${rows.length.toLocaleString()} rows)...`)

    const accts = [...new Set(rows.map(r => r.account))]
    const prods = [...new Set(rows.map(r => r.prod_name))]
    for (let i = 0; i < accts.length; i += 200) {
      const c = accts.slice(i, i+200)
      await q(`INSERT INTO accounts(name,active) VALUES ${c.map((_,j)=>`($${j+1},false)`).join(',')} ON CONFLICT DO NOTHING`, c)
    }
    for (let i = 0; i < prods.length; i += 200) {
      const c = prods.slice(i, i+200)
      await q(`INSERT INTO products(prod_name,active) VALUES ${c.map((_,j)=>`($${j+1},true)`).join(',')} ON CONFLICT DO NOTHING`, c)
      await q(`INSERT INTO inventory(prod_name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [c])
    }

    let n = 0
    const cols = ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords','postbake_adj']
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i+500)
      const vals = chunk.flatMap(r => cols.map(c => r[c]))
      const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
      await q(`INSERT INTO daily_orders(${cols.join(',')}) VALUES ${ph} ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`, vals)
      n += chunk.length
      process.stdout.write(`\r  ${tname}: ${n.toLocaleString()}/${rows.length.toLocaleString()}...`)
    }
    console.log(`\r  ${tname}: ${n.toLocaleString()} rows imported        `)
  }
}

// ── Optional: extras ──────────────────────────────────────────────────────────
if (DO_EXTRAS) {
  console.log('\nExtras tables...')
  for (const tname of ['extras','extrashist']) {
    const rows = tbl(tname).map(r => ({
      order_num: mordnum(r.order_num),
      account:   mstr(r.account),
      ordr_dt:   midate(r.ordr_dt),
      prod_name: mstr(r.prod_name),
      units:     mnum(r.units) ?? 0,
      wprice:    mnum(r.wprice) ?? 0,
      rprice:    mnum(r.rprice) ?? 0,
      del_date:  midate(r.del_date),
      special_ords: true,
    })).filter(r => r.account && r.ordr_dt && r.prod_name)

    if (!rows.length) continue
    process.stdout.write(`  ${tname} (${rows.length.toLocaleString()} rows)...`)

    const accts = [...new Set(rows.map(r => r.account))]
    const prods = [...new Set(rows.map(r => r.prod_name))]
    for (let i = 0; i < accts.length; i += 200) {
      const c = accts.slice(i, i+200)
      await q(`INSERT INTO accounts(name,active) VALUES ${c.map((_,j)=>`($${j+1},false)`).join(',')} ON CONFLICT DO NOTHING`, c)
    }
    for (let i = 0; i < prods.length; i += 200) {
      const c = prods.slice(i, i+200)
      await q(`INSERT INTO products(prod_name,active) VALUES ${c.map((_,j)=>`($${j+1},true)`).join(',')} ON CONFLICT DO NOTHING`, c)
      await q(`INSERT INTO inventory(prod_name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [c])
    }

    let n = 0
    const cols = ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords']
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i+500)
      const vals = chunk.flatMap(r => cols.map(c => r[c]))
      const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
      await q(`INSERT INTO daily_orders(${cols.join(',')}) VALUES ${ph} ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`, vals)
      n += chunk.length
    }
    console.log(`  ${n.toLocaleString()} rows imported`)
  }
}

console.log('\nDone!')
if (!DO_HIST)   console.log('  Tip: --history imports full order history (~3M rows)')
if (!DO_EXTRAS) console.log('  Tip: --extras  imports extras + extrashist (~850K rows)')
if (pool) await pool.end()
