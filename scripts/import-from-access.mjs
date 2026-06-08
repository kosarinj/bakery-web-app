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
import MDBReader from 'mdb-reader'
import { readFileSync } from 'fs'
import pg from 'pg'

const { Pool } = pg

// ── Args ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2)
const MDB_PATH  = args.find(a => !a.startsWith('--')) || 'C:/Users/jeffk/Documents/recipe.mdb'
const DO_HIST   = args.includes('--history')
const DO_EXTRAS = args.includes('--extras')
const DRY_RUN   = args.includes('--dry-run')

if (!process.env.DATABASE_URL && !DRY_RUN) {
  console.error('ERROR: DATABASE_URL not set.')
  console.error('Create a .env file in the project root with:')
  console.error('  DATABASE_URL=postgresql://...(copy from Railway dashboard)...')
  process.exit(1)
}

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
}) : null
const q = (text, params) => pool.query(text, params)

// ── Helpers ───────────────────────────────────────────────────────────────────
const str  = v => (v == null || v === '') ? null : String(v).trim()
const num  = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
const bool = v => v === true || v === 1 || String(v).toLowerCase() === 'true'
const idate = v => {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
// Treat Access "no order number" (0) as NULL since we have a partial unique index on it
const ordnum = v => { const n = parseInt(v); return (!n || n === 0) ? null : n }

function progress(label, done, total) {
  const pct = total ? Math.round(done / total * 100) : 0
  process.stdout.write(`\r  ${label}: ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)   `)
}

async function bulkInsert(label, rows, buildChunkFn, chunkSize = 500) {
  if (!rows.length) { console.log(`  ${label}: 0 rows — skipped`); return 0 }
  if (DRY_RUN) { console.log(`  [dry-run] ${label}: ${rows.length.toLocaleString()} rows would be inserted`); return rows.length }
  let imported = 0, errors = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    try {
      await buildChunkFn(chunk)
      imported += chunk.length
    } catch (e) {
      errors += chunk.length
      if (errors <= chunkSize) console.error(`\n  [chunk error] ${e.message.slice(0, 100)}`)
    }
    progress(label, imported + errors, rows.length)
  }
  console.log(`\r  ${label}: ${imported.toLocaleString()} imported, ${errors} errors        `)
  return imported
}

// ── Read MDB ──────────────────────────────────────────────────────────────────
console.log(`\nReading ${MDB_PATH} ...`)
const buf = readFileSync(MDB_PATH)
const db  = new MDBReader(buf)
const tnames = new Set(db.getTableNames().map(t => t.toLowerCase()))
const tbl = name => {
  const match = db.getTableNames().find(t => t.toLowerCase() === name.toLowerCase())
  return match ? db.getTable(match).getData() : []
}
console.log(`  Found ${db.getTableNames().length} tables\n`)

// ── 1. Accounts ───────────────────────────────────────────────────────────────
console.log('1/9  Accounts ...')
{
  const rows = tbl('Account').map(r => ({
    name:         str(r.name),
    acct_id:      num(r.account),
    acctgrp:      str(r.acctgrp),
    category:     str(r.category),
    subcategory:  str(r.subcategory),
    open_dt:      idate(r.open_dt),
    manager:      str(r.manager),
    owner:        str(r.owner),
    address:      str(r.address),
    city:         str(r.city),
    state:        str(r.state),
    phone:        str(r.phone),
    fax:          str(r.fax),
    email:        str(r.email),
    del_inst:     str(r.del_inst),
    route:        str(r.route),
    sequence:     num(r.sequence) ?? 0,
    entire_inv:   bool(r.entire_inv),
    wrap_muffins: bool(r.wrap_muffins),
    print_inv:    bool(r.print_inv),
    next_del:     idate(r.next_del),
    postord:      bool(r.postord),
    marketfee:    num(r.market_fee) ?? 0,
    gas:          num(r.gas) ?? 0,
    tolls:        num(r.tolls) ?? 0,
    prefix:       str(r.prefix),
    active:       r.active !== false && r.active !== 0,
    region:       str(r.region),
    day_of_week:  str(r.day_of_week),
    webname:      str(r.webname),
    sendweb:      bool(r.sendweb),
    webstart:     idate(r.webstart),
    webend:       idate(r.webend),
    adj_level:    num(r.adj_level) ?? 0,
  })).filter(r => r.name)

  await bulkInsert('accounts', rows, async chunk => {
    const cols = Object.keys(chunk[0])
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const placeholders = chunk.map((_, ri) =>
      '(' + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')'
    ).join(',')
    const updates = cols.filter(c => c !== 'name').map(c => `${c}=EXCLUDED.${c}`).join(',')
    await q(
      `INSERT INTO accounts(${cols.join(',')}) VALUES ${placeholders}
       ON CONFLICT (name) DO UPDATE SET ${updates}`,
      vals
    )
  })
}

// ── 2. Products ───────────────────────────────────────────────────────────────
console.log('2/9  Products ...')
{
  const rows = tbl('Product').map(r => ({
    prod_name:    str(r.prod_name),
    prod_id:      num(r.prod_ID ?? r.prod_id),
    prod_type:    str(r.prod_type),
    prod_group:   str(r.prod_group),
    multiplier:   num(r.multiplier) ?? 1,
    divisor:      num(r.divide_by) ?? 1,
    barcode:      str(r.barcode) ?? str(r.UPC_code),
    upc_code:     str(r.UPC_code),
    batch:        bool(r.batch),
    active:       !bool(r.inactive),
    label1:       str(r.label1),
    label2:       str(r.label2),
    label3:       str(r.label3),
    weight:       num(r.weight),
    color1:       str(r.color1),
    color2:       str(r.color2),
    color3:       str(r.color3),
    subtype:      str(r.subtype),
    ingsize:      num(r.ingsize),
    labelsize:    num(r.labelsize),
    weightsize:   num(r.weightsize),
    ingheight:    num(r.ingheight),
    whichlabel:   str(r.whichlabel),
    labor_weight: num(r.labor_weight),
    webtype:      str(r.webtype),
    gluten_free:  bool(r.gluten_free),
  })).filter(r => r.prod_name)

  await bulkInsert('products', rows, async chunk => {
    const cols = Object.keys(chunk[0])
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')').join(',')
    const upd = cols.filter(c => c !== 'prod_name').map(c => `${c}=EXCLUDED.${c}`).join(',')
    await q(`INSERT INTO products(${cols.join(',')}) VALUES ${ph} ON CONFLICT (prod_name) DO UPDATE SET ${upd}`, vals)
  })

  // Ensure inventory stubs exist for all products
  if (!DRY_RUN) {
    await q(`INSERT INTO inventory(prod_name) SELECT prod_name FROM products ON CONFLICT DO NOTHING`)
  }
}

// ── 3. Prices ─────────────────────────────────────────────────────────────────
console.log('3/9  Prices ...')
{
  const rows = tbl('Price').map(r => ({
    prod_name:   str(r.prod_name),
    category:    str(r.category) ?? 'wholesale',
    whole_price: num(r.whole_price) ?? 0,
    ret_price:   num(r.ret_price) ?? 0,
  })).filter(r => r.prod_name && r.category)

  await bulkInsert('prices', rows, async chunk => {
    const vals = chunk.flatMap(r => [r.prod_name, r.category, r.whole_price, r.ret_price])
    const ph = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(
      `INSERT INTO prices(prod_name, category, whole_price, ret_price) VALUES ${ph}
       ON CONFLICT (prod_name, category) DO UPDATE SET whole_price=EXCLUDED.whole_price, ret_price=EXCLUDED.ret_price`,
      vals
    )
  })
}

// ── 4. Account Prices ─────────────────────────────────────────────────────────
console.log('4/9  Account prices ...')
{
  const rows = tbl('Account_price').map(r => ({
    account:   str(r.account),
    prod_name: str(r.prod_name),
    ret_price: num(r.retail_price) ?? 0,
  })).filter(r => r.account && r.prod_name)

  await bulkInsert('account_prices', rows, async chunk => {
    const vals = chunk.flatMap(r => [r.account, r.prod_name, r.ret_price])
    const ph = chunk.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',')
    await q(
      `INSERT INTO account_prices(account, prod_name, ret_price) VALUES ${ph}
       ON CONFLICT (account, prod_name) DO UPDATE SET ret_price=EXCLUDED.ret_price`,
      vals
    )
  })
}

// ── 5. Ingredients ────────────────────────────────────────────────────────────
console.log('5/9  Ingredients ...')
{
  const rows = tbl('ingredients').map(r => ({
    name:        str(r.ingredient),
    cost_cup:    num(r.cost_cup),
    cost_pound:  num(r.cost_pound),
    cup_pound:   num(r.cup_pound),
  })).filter(r => r.name)

  await bulkInsert('ingredients', rows, async chunk => {
    const vals = chunk.flatMap(r => [r.name, r.cost_cup, r.cost_pound, r.cup_pound])
    const ph = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(
      `INSERT INTO ingredients(name, cost_cup, cost_pound, cup_pound) VALUES ${ph}
       ON CONFLICT (name) DO UPDATE SET cost_cup=EXCLUDED.cost_cup, cost_pound=EXCLUDED.cost_pound, cup_pound=EXCLUDED.cup_pound`,
      vals
    )
  })
}

// ── 6. Recipes ────────────────────────────────────────────────────────────────
console.log('6/9  Recipes ...')
{
  const raw = tbl('new_recipe').map(r => ({
    product:    str(r.product),
    ingredient: str(r.ingredient) || null,   // empty string → NULL (text-only row)
    sequence:   num(r.sequence) ?? 0,
    rectext:    str(r.rectext),
    teaspoons:  num(r.teaspoons) ?? 0,
    tablespoons:num(r.tablespoons) ?? 0,
    cups:       num(r.cups) ?? 0,
    pounds:     num(r.pounds) ?? 0,
    space:      bool(r.space),
    rec_group:  bool(r.rec_group),
    qty:        num(r.qty),
  })).filter(r => r.product)

  // Delete existing recipe rows for products we're about to re-import
  const products = [...new Set(raw.map(r => r.product))]
  if (!DRY_RUN && products.length) {
    await q(`DELETE FROM recipes WHERE product = ANY($1::text[])`, [products])
    console.log(`  Cleared ${products.length} products' existing recipes`)
  }

  await bulkInsert('recipes', raw, async chunk => {
    const cols = ['product','ingredient','sequence','rectext','teaspoons','tablespoons','cups','pounds','space','rec_group','qty']
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO recipes(${cols.join(',')}) VALUES ${ph}`, vals)
  })
}

// ── 7. Inventory ──────────────────────────────────────────────────────────────
console.log('7/9  Inventory ...')
{
  const rows = tbl('Inventory').map(r => ({
    prod_name: str(r.prod_name),
    units:     num(r.units) ?? 0,
    sod_inv:   num(r.sod_inv) ?? 0,
    location:  str(r.location),
  })).filter(r => r.prod_name)

  await bulkInsert('inventory', rows, async chunk => {
    const vals = chunk.flatMap(r => [r.prod_name, r.units, r.sod_inv, r.location])
    const ph = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(
      `INSERT INTO inventory(prod_name, units, sod_inv, location) VALUES ${ph}
       ON CONFLICT (prod_name) DO UPDATE SET units=EXCLUDED.units, sod_inv=EXCLUDED.sod_inv, location=EXCLUDED.location`,
      vals
    )
  })
}

// ── 8. Special Orders ─────────────────────────────────────────────────────────
console.log('8/9  Special orders ...')
{
  const raw = tbl('spec_ord').map(r => ({
    order_num: ordnum(r.order_num),
    account:   str(r.cust),
    location:  str(r.location),
    ordr_dt:   idate(r.ordr_dt),
    prod_name: str(r.prod_name),
    units:     num(r.units) ?? 0,
    price:     num(r.price) ?? 0,
    phone:     str(r.phone),
    notes:     str(r.notes),
  })).filter(r => r.account && r.prod_name && r.ordr_dt)

  // Create stubs for any accounts/products not yet in the DB
  const accts = [...new Set(raw.map(r => r.account))]
  const prods = [...new Set(raw.map(r => r.prod_name))]
  if (!DRY_RUN) {
    for (let i = 0; i < accts.length; i += 200) {
      const chunk = accts.slice(i, i + 200)
      const ph = chunk.map((_, j) => `($${j+1},false)`).join(',')
      await q(`INSERT INTO accounts(name,active) VALUES ${ph} ON CONFLICT DO NOTHING`, chunk)
    }
    for (let i = 0; i < prods.length; i += 200) {
      const chunk = prods.slice(i, i + 200)
      const ph = chunk.map((_, j) => `($${j+1},true)`).join(',')
      await q(`INSERT INTO products(prod_name,active) VALUES ${ph} ON CONFLICT DO NOTHING`, chunk)
      await q(`INSERT INTO inventory(prod_name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [chunk])
    }
  }

  await bulkInsert('spec_orders', raw, async chunk => {
    const cols = ['order_num','account','location','ordr_dt','prod_name','units','price','phone','notes']
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO spec_orders(${cols.join(',')}) VALUES ${ph} ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`, vals)
  })
}

// ── 9. Track Tix ─────────────────────────────────────────────────────────────
console.log('9/9  Track tickets ...')
{
  const combine = [...tbl('Track_tix'), ...tbl('Track_tix_20201215')]
  const dedup = new Map()
  combine.forEach(r => {
    const d = idate(r.date); const a = str(r.account)
    if (d && a) dedup.set(`${d}|${a}`, { tix_date: d, account: a, total: num(r.total) ?? 0, paid: num(r.paid) ?? 0 })
  })
  const rows = [...dedup.values()]

  // Ensure accounts exist
  const accts = [...new Set(rows.map(r => r.account))]
  if (!DRY_RUN) {
    for (let i = 0; i < accts.length; i += 200) {
      const chunk = accts.slice(i, i + 200)
      const ph = chunk.map((_, j) => `($${j+1},false)`).join(',')
      await q(`INSERT INTO accounts(name,active) VALUES ${ph} ON CONFLICT DO NOTHING`, chunk)
    }
  }

  await bulkInsert('track_tix', rows, async chunk => {
    const vals = chunk.flatMap(r => [r.tix_date, r.account, r.total, r.paid])
    const ph = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(
      `INSERT INTO track_tix(tix_date, account, total, paid) VALUES ${ph}
       ON CONFLICT (tix_date, account) DO UPDATE SET total=EXCLUDED.total, paid=EXCLUDED.paid`,
      vals
    )
  })
}

// ── 10. Order History (optional) ──────────────────────────────────────────────
if (DO_HIST) {
  const histTables = ['ordershist','ordershist2','ordershist3',
                      'ordershist_asof_20170825','ordershist050816','daily_ord_bk',
                      'daily_ord','daily_ord_20201214','daily_ord_20201215','dily_ord_20201027']
  console.log(`\n10. Order history (${histTables.length} tables) — this may take a while...`)

  for (const tname of histTables) {
    const rows = tbl(tname).map(r => ({
      order_num:    ordnum(r.order_num),
      account:      str(r.account),
      ordr_dt:      idate(r.ordr_dt),
      prod_name:    str(r.prod_name),
      units:        num(r.units) ?? 0,
      wprice:       num(r.wprice) ?? 0,
      rprice:       num(r.rprice) ?? 0,
      del_date:     idate(r.del_date),
      special_ords: bool(r.special_ords),
      postbake_adj: num(r.postbake_adj) ?? 0,
    })).filter(r => r.account && r.ordr_dt && r.prod_name)

    if (!rows.length) { console.log(`  ${tname}: empty — skipped`); continue }

    // Create stubs
    if (!DRY_RUN) {
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
    }

    await bulkInsert(tname, rows, async chunk => {
      const cols = ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords','postbake_adj']
      const vals = chunk.flatMap(r => cols.map(c => r[c]))
      const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
      await q(
        `INSERT INTO daily_orders(${cols.join(',')}) VALUES ${ph}
         ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`,
        vals
      )
    }, 500)
  }
}

// ── 11. Extras (optional) ─────────────────────────────────────────────────────
if (DO_EXTRAS) {
  const extrasTables = ['extras','extrashist']
  console.log(`\n11. Extras (${extrasTables.length} tables) ...`)

  for (const tname of extrasTables) {
    const rows = tbl(tname).map(r => ({
      order_num:    ordnum(r.order_num),
      account:      str(r.account),
      ordr_dt:      idate(r.ordr_dt),
      prod_name:    str(r.prod_name),
      units:        num(r.units) ?? 0,
      wprice:       num(r.wprice) ?? 0,
      rprice:       num(r.rprice) ?? 0,
      del_date:     idate(r.del_date),
      special_ords: true,
    })).filter(r => r.account && r.ordr_dt && r.prod_name)

    if (!rows.length) continue

    if (!DRY_RUN) {
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
    }

    await bulkInsert(tname, rows, async chunk => {
      const cols = ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords']
      const vals = chunk.flatMap(r => cols.map(c => r[c]))
      const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
      await q(
        `INSERT INTO daily_orders(${cols.join(',')}) VALUES ${ph}
         ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`,
        vals
      )
    }, 500)
  }
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\nDone!')
if (!DO_HIST)   console.log('  Tip: re-run with --history to also import the full order history (~3M rows)')
if (!DO_EXTRAS) console.log('  Tip: re-run with --extras  to also import extras + extrashist (~850K rows)')
if (pool) await pool.end()
