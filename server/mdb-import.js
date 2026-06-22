/**
 * Shared MDB → PostgreSQL import logic.
 * Used by both the local CLI script and the /api/access/* HTTP endpoints.
 */

import { readFileSync, existsSync } from 'fs'

// ── Helpers ───────────────────────────────────────────────────────────────────
export const mstr  = v => (v == null || v === '') ? null : String(v).trim()
export const mnum  = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
export const mbool = v => v === true || v === 1 || String(v).toLowerCase() === 'true'
export const midate = v => {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
export const mordnum = v => { const n = parseInt(v); return (!n || n === 0) ? null : n }
export const mits = v => {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString()
  const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Open an MDB file ──────────────────────────────────────────────────────────
export async function openMDB(filePath) {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const buf = readFileSync(filePath)
  const { default: MDBReader } = await import('mdb-reader')
  return new MDBReader(buf)
}

// Returns table-name-insensitive accessor
export function makeTableGetter(db) {
  const nameMap = new Map(db.getTableNames().map(t => [t.toLowerCase(), t]))
  return name => {
    const real = nameMap.get(name.toLowerCase())
    return real ? db.getTable(real).getData() : []
  }
}

// ── Table info (no full row load for known tables) ────────────────────────────
export const KNOWN_TABLES = [
  { key: 'accounts',       mdbName: 'Account',            label: 'Accounts'       },
  { key: 'products',       mdbName: 'Product',            label: 'Products'       },
  { key: 'prices',         mdbName: 'Price',              label: 'Prices'         },
  { key: 'account_prices', mdbName: 'Account_price',      label: 'Account Prices' },
  { key: 'ingredients',    mdbName: 'ingredients',        label: 'Ingredients'    },
  { key: 'recipes',        mdbName: 'new_recipe',         label: 'Recipes'        },
  { key: 'inventory',      mdbName: 'Inventory',          label: 'Inventory'      },
  { key: 'spec_orders',    mdbName: 'spec_ord',           label: 'Special Orders' },
  { key: 'track_tix',      mdbName: 'Track_tix',          label: 'Track Tickets'  },
]

export function getTableInfo(db) {
  const nameMap = new Map(db.getTableNames().map(t => [t.toLowerCase(), t]))
  return KNOWN_TABLES.map(t => {
    const real = nameMap.get(t.mdbName.toLowerCase())
    if (!real) return { ...t, found: false, rows: 0 }
    const tbl = db.getTable(real)
    return { ...t, found: true, rows: tbl.rowCount ?? '?' }
  })
}

// ── Per-table import functions ────────────────────────────────────────────────

async function chunkInsert(rows, chunkSize, insertFn) {
  let imported = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insertFn(rows.slice(i, i + chunkSize))
    imported += Math.min(chunkSize, rows.length - i)
  }
  return imported
}

// Deduplicate rows, keeping the last value for each unique key (handles MDB duplicate records)
function dedup(rows, keyFn) {
  const map = new Map()
  for (const r of rows) map.set(keyFn(r), r)
  return [...map.values()]
}

export async function importAccounts(tbl, q) {
  const rawRows = tbl('Account').map(r => ({
    name:         mstr(r.name),
    acct_id:      mnum(r.account),
    acctgrp:      mstr(r.acctgrp),
    category:     mstr(r.category),
    subcategory:  mstr(r.subcategory),
    open_dt:      midate(r.open_dt),
    manager:      mstr(r.manager),
    owner:        mstr(r.owner),
    address:      mstr(r.address),
    city:         mstr(r.city),
    state:        mstr(r.state),
    phone:        mstr(r.phone),
    fax:          mstr(r.fax),
    email:        mstr(r.email),
    del_inst:     mstr(r.del_inst),
    route:        mstr(r.route),
    sequence:     mnum(r.sequence) ?? 0,
    entire_inv:   mbool(r.entire_inv),
    wrap_muffins: mbool(r.wrap_muffins),
    print_inv:    mbool(r.print_inv),
    next_del:     midate(r.next_del),
    postord:      mbool(r.postord),
    marketfee:    mnum(r.market_fee) ?? 0,
    gas:          mnum(r.gas) ?? 0,
    tolls:        mnum(r.tolls) ?? 0,
    prefix:       mstr(r.prefix),
    active:       r.active !== false && r.active !== 0,
    region:       mstr(r.region),
    day_of_week:  mstr(r.day_of_week),
    webname:      mstr(r.webname),
    sendweb:      mbool(r.sendweb),
    webstart:     midate(r.webstart),
    webend:       midate(r.webend),
    adj_level:    mnum(r.adj_level) ?? 0,
  })).filter(r => r.name)
  const rows = dedup(rawRows, r => r.name)
  const cols = Object.keys(rows[0] || {})
  const upd  = cols.filter(c => c !== 'name').map(c => `${c}=EXCLUDED.${c}`).join(',')
  return chunkInsert(rows, 100, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph   = chunk.map((_, i) => '(' + cols.map((_, j) => `$${i*cols.length+j+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO accounts(${cols.join(',')}) VALUES ${ph} ON CONFLICT (name) DO UPDATE SET ${upd}`, vals)
  })
}

export async function importProducts(tbl, q) {
  const rawRows = tbl('Product').map(r => ({
    prod_name:    mstr(r.prod_name),
    prod_id:      mnum(r.prod_ID ?? r.prod_id),
    prod_type:    mstr(r.prod_type),
    prod_group:   mstr(r.prod_group),
    multiplier:   mnum(r.multiplier) ?? 1,
    divisor:      mnum(r.divide_by) ?? 1,
    barcode:      mstr(r.barcode) ?? mstr(r.UPC_code),
    upc_code:     mstr(r.UPC_code),
    batch:        mbool(r.batch),
    active:       !mbool(r.inactive),
    label1:       mstr(r.label1),
    label2:       mstr(r.label2),
    label3:       mstr(r.label3),
    weight:       mnum(r.weight),
    color1:       mstr(r.color1),
    color2:       mstr(r.color2),
    color3:       mstr(r.color3),
    subtype:      mstr(r.subtype),
    ingsize:      mnum(r.ingsize),
    labelsize:    mnum(r.labelsize),
    weightsize:   mnum(r.weightsize),
    ingheight:    mnum(r.ingheight),
    whichlabel:   mstr(r.whichlabel),
    labor_weight: mnum(r.labor_weight),
    webtype:      mstr(r.webtype),
    gluten_free:  mbool(r.gluten_free),
  })).filter(r => r.prod_name)
  const rows = dedup(rawRows, r => r.prod_name)

  const cols = Object.keys(rows[0] || {})
  const upd  = cols.filter(c => c !== 'prod_name').map(c => `${c}=EXCLUDED.${c}`).join(',')
  const n = await chunkInsert(rows, 100, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph   = chunk.map((_, i) => '(' + cols.map((_, j) => `$${i*cols.length+j+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO products(${cols.join(',')}) VALUES ${ph} ON CONFLICT (prod_name) DO UPDATE SET ${upd}`, vals)
  })
  await q(`INSERT INTO inventory(prod_name) SELECT prod_name FROM products ON CONFLICT DO NOTHING`)
  return n
}

export async function importPrices(tbl, q) {
  const rows = dedup(
    tbl('Price').map(r => ({
      prod_name:   mstr(r.prod_name),
      category:    mstr(r.category) ?? 'wholesale',
      whole_price: mnum(r.whole_price) ?? 0,
      ret_price:   mnum(r.ret_price)   ?? 0,
    })).filter(r => r.prod_name && r.category),
    r => `${r.prod_name}|${r.category}`
  )

  return chunkInsert(rows, 200, async chunk => {
    const vals = chunk.flatMap(r => [r.prod_name, r.category, r.whole_price, r.ret_price])
    const ph   = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3}::numeric,$${i*4+4}::numeric)`).join(',')
    await q(`
      INSERT INTO prices(prod_name,category,whole_price,ret_price)
      SELECT v.prod_name, v.category, v.whole_price, v.ret_price
      FROM (VALUES ${ph}) AS v(prod_name,category,whole_price,ret_price)
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.prod_name = v.prod_name)
      ON CONFLICT (prod_name,category) DO UPDATE SET whole_price=EXCLUDED.whole_price, ret_price=EXCLUDED.ret_price
    `, vals)
  })
}

export async function importAccountPrices(tbl, q) {
  const rows = dedup(
    tbl('Account_price').map(r => ({
      account:   mstr(r.account),
      prod_name: mstr(r.prod_name),
      ret_price: mnum(r.retail_price) ?? 0,
    })).filter(r => r.account && r.prod_name),
    r => `${r.account}|${r.prod_name}`
  )

  return chunkInsert(rows, 200, async chunk => {
    const vals = chunk.flatMap(r => [r.account, r.prod_name, r.ret_price])
    const ph   = chunk.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3}::numeric)`).join(',')
    await q(`
      INSERT INTO account_prices(account,prod_name,ret_price)
      SELECT v.account, v.prod_name, v.ret_price
      FROM (VALUES ${ph}) AS v(account,prod_name,ret_price)
      WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.name = v.account)
        AND EXISTS (SELECT 1 FROM products p WHERE p.prod_name = v.prod_name)
      ON CONFLICT (account,prod_name) DO UPDATE SET ret_price=EXCLUDED.ret_price
    `, vals)
  })
}

export async function importIngredients(tbl, q) {
  const rows = dedup(
    tbl('ingredients').map(r => ({
      name:        mstr(r.ingredient),
      cost_cup:    mnum(r.cost_cup),
      cost_pound:  mnum(r.cost_pound),
      cup_pound:   mnum(r.cup_pound),
    })).filter(r => r.name),
    r => r.name
  )

  return chunkInsert(rows, 200, async chunk => {
    const vals = chunk.flatMap(r => [r.name, r.cost_cup, r.cost_pound, r.cup_pound])
    const ph   = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(`INSERT INTO ingredients(name,cost_cup,cost_pound,cup_pound) VALUES ${ph}
             ON CONFLICT (name) DO UPDATE SET cost_cup=EXCLUDED.cost_cup, cost_pound=EXCLUDED.cost_pound, cup_pound=EXCLUDED.cup_pound`, vals)
  })
}

export async function importRecipes(tbl, q) {
  const rows = dedup(
    tbl('new_recipe').map(r => ({
      product:     mstr(r.product),
      ingredient:  mstr(r.ingredient) || null,
      sequence:    mnum(r.sequence) ?? 0,
      rectext:     mstr(r.rectext),
      teaspoons:   mnum(r.teaspoons)   ?? 0,
      tablespoons: mnum(r.tablespoons) ?? 0,
      cups:        mnum(r.cups)        ?? 0,
      pounds:      mnum(r.pounds)      ?? 0,
      space:       mbool(r.space),
      rec_group:   mbool(r.rec_group),
      qty:         mnum(r.qty),
    })).filter(r => r.product),
    r => `${r.product}|${r.ingredient ?? '\0'}|${r.sequence}`
  )

  const products = [...new Set(rows.map(r => r.product))]
  if (products.length) {
    await q(`DELETE FROM recipes WHERE product = ANY($1::text[])`, [products])
  }

  const cols  = ['product','ingredient','sequence','rectext','teaspoons','tablespoons','cups','pounds','space','rec_group','qty']
  const casts = { sequence:'::int', teaspoons:'::numeric', tablespoons:'::numeric', cups:'::numeric', pounds:'::numeric', space:'::bool', rec_group:'::bool', qty:'::numeric' }
  return chunkInsert(rows, 200, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph   = chunk.map((_, i) => '(' + cols.map((c, j) => `$${i*cols.length+j+1}${casts[c]??''}`).join(',') + ')').join(',')
    await q(`
      INSERT INTO recipes(${cols.join(',')})
      SELECT ${cols.map(c => `v.${c}`).join(',')}
      FROM (VALUES ${ph}) AS v(${cols.join(',')})
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.prod_name = v.product)
        AND (v.ingredient IS NULL OR EXISTS (SELECT 1 FROM ingredients i WHERE i.name = v.ingredient))
      ON CONFLICT DO NOTHING
    `, vals)
  })
}

export async function importInventory(tbl, q) {
  const rows = dedup(
    tbl('Inventory').map(r => ({
      prod_name: mstr(r.prod_name),
      units:     mnum(r.units)   ?? 0,
      sod_inv:   mnum(r.sod_inv) ?? 0,
      location:  mstr(r.location),
    })).filter(r => r.prod_name),
    r => r.prod_name
  )

  return chunkInsert(rows, 200, async chunk => {
    const vals = chunk.flatMap(r => [r.prod_name, r.units, r.sod_inv, r.location])
    const ph   = chunk.map((_, i) => `($${i*4+1},$${i*4+2}::numeric,$${i*4+3}::numeric,$${i*4+4})`).join(',')
    await q(`
      INSERT INTO inventory(prod_name,units,sod_inv,location)
      SELECT v.prod_name, v.units, v.sod_inv, v.location
      FROM (VALUES ${ph}) AS v(prod_name,units,sod_inv,location)
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.prod_name = v.prod_name)
      ON CONFLICT (prod_name) DO UPDATE SET units=EXCLUDED.units, sod_inv=EXCLUDED.sod_inv, location=EXCLUDED.location
    `, vals)
  })
}

export async function importSpecOrders(tbl, q) {
  const rows = tbl('spec_ord').map(r => ({
    order_num: mordnum(r.order_num),
    account:   mstr(r.cust),
    location:  mstr(r.location),
    ordr_dt:   midate(r.ordr_dt),
    prod_name: mstr(r.prod_name),
    units:     mnum(r.units)  ?? 0,
    price:     mnum(r.price)  ?? 0,
    phone:     mstr(r.phone),
    notes:     mstr(r.notes),
  })).filter(r => r.account && r.prod_name && r.ordr_dt)

  // Stubs for missing accounts + products
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

  const cols = ['order_num','account','location','ordr_dt','prod_name','units','price','phone','notes']
  return chunkInsert(rows, 500, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph   = chunk.map((_, i) => '(' + cols.map((_, j) => `$${i*cols.length+j+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO spec_orders(${cols.join(',')}) VALUES ${ph}
             ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`, vals)
  })
}

export async function importTrackTix(tbl, q) {
  const combine = [...tbl('Track_tix'), ...tbl('Track_tix_20201215')]
  const dedup   = new Map()
  combine.forEach(r => {
    const d = midate(r.date); const a = mstr(r.account)
    if (d && a) dedup.set(`${d}|${a}`, { tix_date: d, account: a, total: mnum(r.total) ?? 0, paid: mnum(r.paid) ?? 0 })
  })
  const rows = [...dedup.values()]

  const accts = [...new Set(rows.map(r => r.account))]
  for (let i = 0; i < accts.length; i += 200) {
    const c = accts.slice(i, i+200)
    await q(`INSERT INTO accounts(name,active) VALUES ${c.map((_,j)=>`($${j+1},false)`).join(',')} ON CONFLICT DO NOTHING`, c)
  }

  return chunkInsert(rows, 500, async chunk => {
    const vals = chunk.flatMap(r => [r.tix_date, r.account, r.total, r.paid])
    const ph   = chunk.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',')
    await q(`INSERT INTO track_tix(tix_date,account,total,paid) VALUES ${ph}
             ON CONFLICT (tix_date,account) DO UPDATE SET total=EXCLUDED.total, paid=EXCLUDED.paid`, vals)
  })
}

async function importDailyOrderRows(rows, q, { isExtra = false } = {}) {
  if (!rows.length) return 0
  const accts = [...new Set(rows.map(r => r.account))]
  const prods = [...new Set(rows.map(r => r.prod_name))]
  for (let i = 0; i < accts.length; i += 200) {
    const c = accts.slice(i, i + 200)
    await q(`INSERT INTO accounts(name,active) VALUES ${c.map((_,j)=>`($${j+1},false)`).join(',')} ON CONFLICT DO NOTHING`, c)
  }
  for (let i = 0; i < prods.length; i += 200) {
    const c = prods.slice(i, i + 200)
    if (isExtra) {
      // Mark these products as extras; update existing products too
      await q(`INSERT INTO products(prod_name,active,is_extra)
               SELECT unnest($1::text[]),true,true
               ON CONFLICT(prod_name) DO UPDATE SET is_extra=true`, [c])
    } else {
      await q(`INSERT INTO products(prod_name,active) VALUES ${c.map((_,j)=>`($${j+1},true)`).join(',')} ON CONFLICT DO NOTHING`, c)
    }
    await q(`INSERT INTO inventory(prod_name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [c])
  }
  const cols = ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords','postbake_adj']
  return chunkInsert(rows, 500, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c]))
    const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO daily_orders(${cols.join(',')}) VALUES ${ph} ON CONFLICT (order_num) WHERE order_num IS NOT NULL DO NOTHING`, vals)
  })
}

export async function importOrderHistory(tbl, q) {
  const rows = tbl('_').map(r => ({
    order_num:    mordnum(r.order_num),
    account:      mstr(r.account),
    ordr_dt:      midate(r.ordr_dt),
    prod_name:    mstr(r.prod_name),
    units:        mnum(r.units) ?? 0,
    wprice:       mnum(r.wprice) ?? 0,
    rprice:       mnum(r.rprice) ?? 0,
    del_date:     midate(r.del_date),
    special_ords: mbool(r.special_ords) ? 1 : 0,
    postbake_adj: mnum(r.postbake_adj) ?? 0,
  })).filter(r => r.account && r.ordr_dt && r.prod_name)
  return importDailyOrderRows(rows, q)
}

export async function importExtras(tbl, q) {
  const rows = tbl('_').map(r => ({
    order_num:    mordnum(r.order_num),
    account:      mstr(r.account),
    ordr_dt:      midate(r.ordr_dt),
    prod_name:    mstr(r.prod_name),
    units:        mnum(r.units) ?? 0,
    wprice:       mnum(r.wprice) ?? 0,
    rprice:       mnum(r.rprice) ?? 0,
    del_date:     midate(r.del_date),
    special_ords: mbool(r.special_ords) ? 1 : 0,
    postbake_adj: mnum(r.postbake_adj) ?? 0,
  })).filter(r => r.account && r.ordr_dt && r.prod_name)
  return importDailyOrderRows(rows, q, { isExtra: true })
}

export async function importDailyInventory(tbl, q) {
  const rows = tbl('_').map(r => ({
    location:   mstr(r.location),
    inv_date:   midate(r.date),
    prod_name:  mstr(r.prod_name),
    scanned_at: mits(r.timestamp),
    left_qty:   mnum(r.Left)   ?? 0,
    return_qty: mnum(r.Return) ?? 0,
    override:   mbool(r.override),
  })).filter(r => r.location && r.inv_date && r.prod_name)
  if (!rows.length) return 0

  const prods = [...new Set(rows.map(r => r.prod_name))]
  for (let i = 0; i < prods.length; i += 200) {
    const c = prods.slice(i, i + 200)
    await q(`INSERT INTO products(prod_name,active) VALUES ${c.map((_,j)=>`($${j+1},false)`).join(',')} ON CONFLICT DO NOTHING`, c)
  }

  const cols = ['location','inv_date','prod_name','scanned_at','left_qty','return_qty','override']
  return chunkInsert(rows, 500, async chunk => {
    const vals = chunk.flatMap(r => cols.map(c => r[c] ?? null))
    const ph = chunk.map((_, ri) => '(' + cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',') + ')').join(',')
    await q(`INSERT INTO daily_inventory(${cols.join(',')}) VALUES ${ph} ON CONFLICT DO NOTHING`, vals)
  })
}

// ── Dispatch by key ───────────────────────────────────────────────────────────
export const IMPORTERS = {
  accounts:       importAccounts,
  products:       importProducts,
  prices:         importPrices,
  account_prices: importAccountPrices,
  ingredients:    importIngredients,
  recipes:        importRecipes,
  inventory:      importInventory,
  spec_orders:    importSpecOrders,
  track_tix:      importTrackTix,
  order_history:    importOrderHistory,
  extras:           importExtras,
  daily_inventory:  importDailyInventory,
}
