import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pool, { query } from './db.js'

const PgStore = connectPgSimple(session)
const __dirname = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = express()
const PORT = process.env.PORT || 3002

app.set('trust proxy', 1)
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'bakery-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}))

const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' })
  next()
}

// ─── Auth ──────────────────────────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  try {
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username])
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })
    const valid = await bcrypt.compare(password, rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    req.session.user = { id: rows[0].id, username: rows[0].username, role: rows[0].role }
    res.json({ success: true, user: req.session.user })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

app.get('/api/me', (req, res) => {
  res.json(req.session?.user || null)
})

// ─── Settings ──────────────────────────────────────────────────────────────

app.get('/api/settings', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM settings')
  const map = {}
  rows.forEach(r => { map[r.setting] = r.value })
  res.json(map)
})

app.patch('/api/settings/:key', requireAuth, async (req, res) => {
  const { value } = req.body
  await query('INSERT INTO settings(setting,value) VALUES($1,$2) ON CONFLICT(setting) DO UPDATE SET value=$2', [req.params.key, value])
  res.json({ success: true })
})

// ─── Products ──────────────────────────────────────────────────────────────

app.get('/api/products', requireAuth, async (req, res) => {
  const all = req.query.all === '1'
  try {
    const { rows } = await query(
      all
        ? 'SELECT * FROM products ORDER BY prod_group, prod_name'
        : 'SELECT * FROM products WHERE active=true ORDER BY prod_group, prod_name'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/products', requireAuth, async (req, res) => {
  const { prod_name, prod_type, prod_group, barcode, multiplier, divisor, batch, notes } = req.body
  try {
    const { rows } = await query(
      `INSERT INTO products(prod_name,prod_type,prod_group,barcode,multiplier,divisor,batch,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [prod_name, prod_type, prod_group, barcode, multiplier||1, divisor||1, batch||false, notes]
    )
    // Also create inventory row
    await query('INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING', [prod_name])
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/products/:name', requireAuth, async (req, res) => {
  const fields = [
    'prod_type','prod_group','barcode','multiplier','divisor','batch','active','notes',
    'prod_id','upc_code','label1','label2','label3','weight','color1','color2','color3',
    'subtype','ingsize','labelsize','weightsize','ingheight','whichlabel','labor_weight','webtype','gluten_free'
  ]
  const updates = []
  const vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  if (!updates.length) return res.json({ success: true })
  vals.push(req.params.name)
  await query(`UPDATE products SET ${updates.join(',')} WHERE prod_name=$${vals.length}`, vals)
  res.json({ success: true })
})

// ─── Accounts ──────────────────────────────────────────────────────────────

app.get('/api/accounts', requireAuth, async (req, res) => {
  const all = req.query.all === '1'
  try {
    const { rows } = await query(
      all
        ? 'SELECT * FROM accounts ORDER BY sequence, name'
        : 'SELECT * FROM accounts WHERE active=true ORDER BY sequence, name'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/accounts', requireAuth, async (req, res) => {
  const { name, route, sequence, category, acctgrp, marketfee, prefix, postord, notes } = req.body
  try {
    const { rows } = await query(
      `INSERT INTO accounts(name,route,sequence,category,acctgrp,marketfee,prefix,postord,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, route, sequence||0, category||'wholesale', acctgrp, marketfee||0, prefix, postord||false, notes]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/accounts/:name', requireAuth, async (req, res) => {
  const fields = [
    'route','sequence','category','acctgrp','balance','marketfee','prefix','postord','active','notes',
    'acct_id','subcategory','open_dt','manager','owner','address','city','state','phone','fax','email',
    'del_inst','entire_inv','wrap_muffins','print_inv','next_del','gas','tolls',
    'region','day_of_week','webname','sendweb','webstart','webend','adj_level'
  ]
  const updates = []
  const vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  if (!updates.length) return res.json({ success: true })
  vals.push(req.params.name)
  await query(`UPDATE accounts SET ${updates.join(',')} WHERE name=$${vals.length}`, vals)
  res.json({ success: true })
})

// ─── Inventory ─────────────────────────────────────────────────────────────

app.get('/api/inventory', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT p.prod_name, p.prod_type, p.prod_group, p.barcode,
           COALESCE(i.units,0) AS units, COALESCE(i.sod_inv,0) AS sod_inv,
           i.location, i.lst_updt
    FROM products p
    LEFT JOIN inventory i ON i.prod_name = p.prod_name
    WHERE p.active = true
    ORDER BY p.prod_group, p.prod_name
  `)
  res.json(rows)
})

app.patch('/api/inventory/:prod_name', requireAuth, async (req, res) => {
  const { units, sod_inv, location } = req.body
  const fields = []; const vals = []
  if (units !== undefined) { vals.push(units); fields.push(`units=$${vals.length}`) }
  if (sod_inv !== undefined) { vals.push(sod_inv); fields.push(`sod_inv=$${vals.length}`) }
  if (location !== undefined) { vals.push(location); fields.push(`location=$${vals.length}`) }
  fields.push(`lst_updt=NOW()`)
  vals.push(req.params.prod_name)
  await query(
    `INSERT INTO inventory(prod_name,units,sod_inv,location,lst_updt)
     VALUES($${vals.length},${units!==undefined?`$${vals.indexOf(units)+1}`:'0'},${sod_inv!==undefined?`$${vals.indexOf(sod_inv)+1}`:'0'},${location!==undefined?`$${vals.indexOf(location)+1}`:'NULL'},NOW())
     ON CONFLICT(prod_name) DO UPDATE SET ${fields.join(',')}`,
    vals
  )
  res.json({ success: true })
})

// Simpler upsert endpoint for inventory
app.put('/api/inventory/:prod_name', requireAuth, async (req, res) => {
  const { units, sod_inv, location } = req.body
  try {
    await query(
      `INSERT INTO inventory(prod_name, units, sod_inv, location, lst_updt)
       VALUES($1, $2, $3, $4, NOW())
       ON CONFLICT(prod_name) DO UPDATE SET
         units = EXCLUDED.units,
         sod_inv = COALESCE(EXCLUDED.sod_inv, inventory.sod_inv),
         location = COALESCE(EXCLUDED.location, inventory.location),
         lst_updt = NOW()`,
      [req.params.prod_name, units ?? 0, sod_inv ?? null, location ?? null]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ─── Prices ────────────────────────────────────────────────────────────────

app.get('/api/prices', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT p.prod_name, p.prod_type, p.prod_group,
           pr.id, pr.category, pr.whole_price, pr.ret_price, pr.last_update
    FROM products p
    LEFT JOIN prices pr ON pr.prod_name = p.prod_name
    WHERE p.active = true
    ORDER BY p.prod_group, p.prod_name, pr.category
  `)
  res.json(rows)
})

app.put('/api/prices', requireAuth, async (req, res) => {
  const { prod_name, category, whole_price, ret_price } = req.body
  try {
    await query(
      `INSERT INTO prices(prod_name, category, whole_price, ret_price, last_update)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(prod_name, category) DO UPDATE SET
         whole_price=EXCLUDED.whole_price, ret_price=EXCLUDED.ret_price, last_update=NOW()`,
      [prod_name, category||'wholesale', whole_price||0, ret_price||0]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Account-specific prices
app.get('/api/account-prices/:account', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM account_prices WHERE account=$1 ORDER BY prod_name',
    [req.params.account]
  )
  res.json(rows)
})

app.put('/api/account-prices', requireAuth, async (req, res) => {
  const { account, prod_name, whole_price, ret_price } = req.body
  await query(
    `INSERT INTO account_prices(account,prod_name,whole_price,ret_price,last_update)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(account,prod_name) DO UPDATE SET
       whole_price=EXCLUDED.whole_price, ret_price=EXCLUDED.ret_price, last_update=NOW()`,
    [account, prod_name, whole_price, ret_price]
  )
  res.json({ success: true })
})

// ─── Daily Orders ──────────────────────────────────────────────────────────

app.get('/api/orders', requireAuth, async (req, res) => {
  const { date, account } = req.query
  const conditions = []
  const vals = []
  if (date) { vals.push(date); conditions.push(`o.ordr_dt = $${vals.length}`) }
  if (account) { vals.push(account); conditions.push(`o.account = $${vals.length}`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  try {
    const { rows } = await query(`
      SELECT o.*, p.prod_type, p.prod_group
      FROM daily_orders o
      LEFT JOIN products p ON p.prod_name = o.prod_name
      ${where}
      ORDER BY o.account, p.prod_group, o.prod_name
    `, vals)
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/orders', requireAuth, async (req, res) => {
  const { prod_name, account, units, wprice, rprice, ordr_dt, del_date, special_ords, notes } = req.body
  try {
    const { rows } = await query(
      `INSERT INTO daily_orders(prod_name,account,units,wprice,rprice,ordr_dt,del_date,special_ords,notes,last_update)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [prod_name, account, units||0, wprice||0, rprice||0, ordr_dt||new Date().toISOString().slice(0,10), del_date||null, special_ords||false, notes]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/orders/:id', requireAuth, async (req, res) => {
  const fields = ['units','wprice','rprice','ordr_dt','del_date','special_ords','postbake_adj','notes']
  const updates = ['last_update=NOW()']
  const vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  vals.push(req.params.id)
  await query(`UPDATE daily_orders SET ${updates.join(',')} WHERE id=$${vals.length}`, vals)
  res.json({ success: true })
})

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM daily_orders WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

// Copy orders from one date to another (skips account+product pairs already entered on to_date)
// Optional: accounts array limits which accounts are copied
app.post('/api/orders/copy', requireAuth, async (req, res) => {
  const { from_date, to_date, accounts } = req.body
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' })
  const hasAcctFilter = Array.isArray(accounts) && accounts.length > 0
  try {
    const { rows } = await query(`
      INSERT INTO daily_orders(prod_name, account, units, wprice, rprice, ordr_dt, last_update)
      SELECT f.prod_name, f.account, f.units, f.wprice, f.rprice, $2::date, NOW()
      FROM daily_orders f
      WHERE f.ordr_dt = $1
        ${hasAcctFilter ? 'AND f.account = ANY($3::text[])' : ''}
        AND NOT EXISTS (
          SELECT 1 FROM daily_orders e
          WHERE e.prod_name = f.prod_name
            AND e.account = f.account
            AND e.ordr_dt = $2::date
        )
      RETURNING *
    `, hasAcctFilter ? [from_date, to_date, accounts] : [from_date, to_date])
    res.json({ copied: rows.length, rows })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Orders summary: units per product for a given date (for bake list / have-need)
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const [accts, prods, orders] = await Promise.all([
    query('SELECT COUNT(*) FROM accounts WHERE active=true'),
    query('SELECT COUNT(*) FROM products WHERE active=true'),
    query('SELECT COUNT(DISTINCT account) AS orders_today, COUNT(*) AS order_lines FROM daily_orders WHERE ordr_dt=$1', [today]),
  ])
  res.json({
    accounts:     parseInt(accts.rows[0].count),
    products:     parseInt(prods.rows[0].count),
    orders_today: parseInt(orders.rows[0].orders_today),
    order_lines:  parseInt(orders.rows[0].order_lines),
  })
})

app.get('/api/orders/active-dates', requireAuth, async (req, res) => {
  const { month } = req.query
  if (!month) return res.json([])
  const { rows } = await query(
    `SELECT ordr_dt::text AS date,
            COUNT(DISTINCT account) AS account_count,
            COUNT(*) AS order_count
     FROM daily_orders
     WHERE ordr_dt >= $1::date AND ordr_dt < ($1::date + INTERVAL '1 month')
     GROUP BY ordr_dt ORDER BY ordr_dt`,
    [month + '-01']
  )
  res.json(rows)
})

app.get('/api/orders/summary', requireAuth, async (req, res) => {
  const { date } = req.query
  const dateVal = date || new Date().toISOString().slice(0,10)
  const { rows } = await query(`
    SELECT o.prod_name, p.prod_type, p.prod_group,
           SUM(o.units) AS total_units,
           COUNT(DISTINCT o.account) AS account_count
    FROM daily_orders o
    JOIN products p ON p.prod_name = o.prod_name
    WHERE o.ordr_dt = $1
    GROUP BY o.prod_name, p.prod_type, p.prod_group
    ORDER BY p.prod_group, o.prod_name
  `, [dateVal])
  res.json(rows)
})

// ─── Ingredients ───────────────────────────────────────────────────────────

app.get('/api/ingredients', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM ingredients ORDER BY name')
  res.json(rows)
})

app.post('/api/ingredients', requireAuth, async (req, res) => {
  const { name, unit, notes } = req.body
  try {
    const { rows } = await query(
      'INSERT INTO ingredients(name,unit,notes) VALUES($1,$2,$3) RETURNING *',
      [name, unit, notes]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/ingredients/:id', requireAuth, async (req, res) => {
  const { name, unit, notes } = req.body
  await query('UPDATE ingredients SET name=$1,unit=$2,notes=$3 WHERE id=$4', [name, unit, notes, req.params.id])
  res.json({ success: true })
})

app.delete('/api/ingredients/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM ingredients WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

// ─── Recipes ───────────────────────────────────────────────────────────────

app.get('/api/recipes', requireAuth, async (req, res) => {
  const { product } = req.query
  const vals = []
  const where = product ? (vals.push(product), 'WHERE r.product=$1') : ''
  const { rows } = await query(`
    SELECT r.*, i.unit AS ingredient_unit
    FROM recipes r
    LEFT JOIN ingredients i ON i.name = r.ingredient
    ${where}
    ORDER BY r.product, r.sequence, r.ingredient
  `, vals)
  res.json(rows)
})

app.put('/api/recipes', requireAuth, async (req, res) => {
  const { product, ingredient, sequence, teaspoons, tablespoons, cups, pounds, rec_group, qty, rectext } = req.body
  try {
    await query(
      `INSERT INTO recipes(product,ingredient,sequence,teaspoons,tablespoons,cups,pounds,rec_group,qty,rectext,last_update)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT(product,ingredient) DO UPDATE SET
         sequence=EXCLUDED.sequence, teaspoons=EXCLUDED.teaspoons, tablespoons=EXCLUDED.tablespoons,
         cups=EXCLUDED.cups, pounds=EXCLUDED.pounds, rec_group=EXCLUDED.rec_group,
         qty=EXCLUDED.qty, rectext=EXCLUDED.rectext, last_update=NOW()`,
      [product, ingredient, sequence||0, teaspoons||0, tablespoons||0, cups||0, pounds||0, rec_group||false, qty||0, rectext]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/recipes/:id', requireAuth, async (req, res) => {
  const fields = ['sequence','teaspoons','tablespoons','cups','pounds','rec_group','qty','rectext']
  const updates = ['last_update=NOW()']
  const vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  vals.push(req.params.id)
  await query(`UPDATE recipes SET ${updates.join(',')} WHERE id=$${vals.length}`, vals)
  res.json({ success: true })
})

app.delete('/api/recipes/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM recipes WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

// ─── Bake List ─────────────────────────────────────────────────────────────

app.get('/api/bake-list', requireAuth, async (req, res) => {
  const { date } = req.query
  const dateVal = date || new Date().toISOString().slice(0,10)
  const { rows } = await query(`
    SELECT b.*, p.prod_type, p.prod_group, p.multiplier,
           COALESCE(i.units,0) AS inv_units
    FROM bake_list b
    JOIN products p ON p.prod_name = b.prod_name
    LEFT JOIN inventory i ON i.prod_name = b.prod_name
    WHERE b.bake_date = $1
    ORDER BY p.prod_group, b.prod_name
  `, [dateVal])
  res.json(rows)
})

// Auto-generate bake list from orders
app.post('/api/bake-list/generate', requireAuth, async (req, res) => {
  const { date } = req.body
  const dateVal = date || new Date().toISOString().slice(0,10)
  try {
    // Replace existing bake list for the date, then insert from order totals
    await query(`DELETE FROM bake_list WHERE bake_date = $1`, [dateVal])
    await query(`
      INSERT INTO bake_list(prod_name, units, bake_date, last_update)
      SELECT o.prod_name,
             GREATEST(0, SUM(o.units) - COALESCE(inv.units,0)) AS units,
             $1::date,
             NOW()
      FROM daily_orders o
      LEFT JOIN inventory inv ON inv.prod_name = o.prod_name
      WHERE o.ordr_dt = $1
      GROUP BY o.prod_name
    `, [dateVal])
    const { rows } = await query('SELECT * FROM bake_list WHERE bake_date=$1 ORDER BY prod_name', [dateVal])
    res.json(rows)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.put('/api/bake-list', requireAuth, async (req, res) => {
  const { prod_name, units, bake_date, notes } = req.body
  try {
    const { rows } = await query(
      `INSERT INTO bake_list(prod_name, units, bake_date, notes, last_update)
       VALUES($1,$2,$3,$4,NOW()) RETURNING *`,
      [prod_name, units||0, bake_date||new Date().toISOString().slice(0,10), notes]
    )
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.patch('/api/bake-list/:id', requireAuth, async (req, res) => {
  const { units, notes } = req.body
  await query('UPDATE bake_list SET units=$1, notes=$2, last_update=NOW() WHERE id=$3', [units, notes, req.params.id])
  res.json({ success: true })
})

app.delete('/api/bake-list/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM bake_list WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

// ─── Have/Need view (orders vs inventory) ──────────────────────────────────

app.get('/api/have-need', requireAuth, async (req, res) => {
  const { date } = req.query
  const dateVal = date || new Date().toISOString().slice(0,10)
  const { rows } = await query(`
    SELECT p.prod_name, p.prod_type, p.prod_group,
           COALESCE(SUM(o.units),0) AS ordered,
           COALESCE(inv.units,0) AS have,
           COALESCE(SUM(o.units),0) - COALESCE(inv.units,0) AS need
    FROM products p
    LEFT JOIN daily_orders o ON o.prod_name = p.prod_name AND o.ordr_dt = $1
    LEFT JOIN inventory inv ON inv.prod_name = p.prod_name
    WHERE p.active = true
    GROUP BY p.prod_name, p.prod_type, p.prod_group, inv.units
    ORDER BY p.prod_group, p.prod_name
  `, [dateVal])
  res.json(rows)
})

// ─── Recipe Generator ──────────────────────────────────────────────────────

function scaleIngredients(rows, factor) {
  return rows.map(r => ({
    ingredient: r.ingredient,
    sequence: r.sequence,
    rectext: r.rectext,
    space: r.space,
    teaspoons:   (parseFloat(r.teaspoons)   || 0) * factor,
    tablespoons: (parseFloat(r.tablespoons) || 0) * factor,
    cups:        (parseFloat(r.cups)        || 0) * factor,
    pounds:      (parseFloat(r.pounds)      || 0) * factor,
    qty:         (parseFloat(r.qty)         || 0) * factor,
    ingr_unit: r.ingr_unit,
  }))
}

app.get('/api/recipe-generator', requireAuth, async (req, res) => {
  const dateVal = req.query.date || new Date().toISOString().slice(0, 10)
  try {
    // Orders for date with product batch info
    const { rows: orders } = await query(`
      SELECT o.prod_name, SUM(o.units) AS units,
             p.batch, p.prod_group,
             COALESCE(p.multiplier,1) AS multiplier,
             COALESCE(p.divisor,1)    AS divisor
      FROM daily_orders o
      JOIN products p ON p.prod_name = o.prod_name
      WHERE o.ordr_dt = $1
      GROUP BY o.prod_name, p.batch, p.prod_group, p.multiplier, p.divisor
      ORDER BY o.prod_name
    `, [dateVal])

    if (!orders.length) return res.json({ batch_groups: [], mult_products: [], date: dateVal })

    // All recipe rows for ordered products + their group names
    const allNames = [...new Set([
      ...orders.map(o => o.prod_name),
      ...orders.map(o => o.prod_group).filter(Boolean),
    ])]
    const { rows: recRows } = await query(`
      SELECT r.*, i.unit AS ingr_unit
      FROM recipes r
      LEFT JOIN ingredients i ON i.name = r.ingredient
      WHERE r.product = ANY($1)
      ORDER BY r.product, r.sequence
    `, [allNames])

    // Build recipe map  { productName: [rows...] }
    const recMap = {}
    recRows.forEach(r => {
      if (!recMap[r.product]) recMap[r.product] = []
      recMap[r.product].push(r)
    })

    // Separate batch vs mult orders
    const groupMap = {}
    const multProducts = []

    orders.forEach(o => {
      const units = parseFloat(o.units) || 0
      const divisor = parseFloat(o.divisor) || 1
      const multiplier = parseFloat(o.multiplier) || 1

      if (o.batch && o.prod_group) {
        if (!groupMap[o.prod_group]) {
          groupMap[o.prod_group] = { group: o.prod_group, products: [], total_equiv: 0, multiplier }
        }
        const equiv = units / divisor
        groupMap[o.prod_group].total_equiv += equiv
        groupMap[o.prod_group].products.push({ prod_name: o.prod_name, units, divisor, equiv })
      } else {
        const batches = multiplier > 0 ? Math.ceil(units / multiplier) : units
        const recipes = recMap[o.prod_name] || []
        multProducts.push({
          prod_name: o.prod_name, units, multiplier, batches,
          ingredients: scaleIngredients(recipes, batches)
        })
      }
    })

    const batchGroups = Object.values(groupMap).map(g => {
      const batches = g.multiplier > 0 ? Math.ceil(g.total_equiv / g.multiplier) : 1
      const recipes = recMap[g.group] || recMap[g.products[0]?.prod_name] || []
      return { ...g, batches, ingredients: scaleIngredients(recipes, batches) }
    })

    res.json({ batch_groups: batchGroups, mult_products: multProducts, date: dateVal })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Export ────────────────────────────────────────────────────────────────

function toCSV(rows, cols) {
  const esc = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

const EXPORTS = {
  products:       [`SELECT prod_name,prod_id,prod_type,prod_group,subtype,multiplier,divisor,batch,active,gluten_free,
                          barcode,upc_code,label1,label2,label3,weight,color1,color2,color3,
                          ingsize,labelsize,weightsize,ingheight,whichlabel,labor_weight,webtype,notes
                   FROM products ORDER BY prod_group,prod_name`,
                   ['prod_name','prod_id','prod_type','prod_group','subtype','multiplier','divisor','batch','active','gluten_free',
                    'barcode','upc_code','label1','label2','label3','weight','color1','color2','color3',
                    'ingsize','labelsize','weightsize','ingheight','whichlabel','labor_weight','webtype','notes']],
  accounts:       [`SELECT name,acct_id,acctgrp,subcategory,category,route,sequence,region,day_of_week,
                          manager,owner,address,city,state,phone,fax,email,
                          del_inst,prefix,postord,entire_inv,wrap_muffins,print_inv,next_del,
                          marketfee,gas,tolls,balance,webname,sendweb,webstart,webend,adj_level,
                          open_dt,active,notes
                   FROM accounts ORDER BY sequence,name`,
                   ['name','acct_id','acctgrp','subcategory','category','route','sequence','region','day_of_week',
                    'manager','owner','address','city','state','phone','fax','email',
                    'del_inst','prefix','postord','entire_inv','wrap_muffins','print_inv','next_del',
                    'marketfee','gas','tolls','balance','webname','sendweb','webstart','webend','adj_level',
                    'open_dt','active','notes']],
  prices:         ['SELECT price_id,prod_name,category,whole_price,ret_price,last_update FROM prices ORDER BY prod_name,category',
                   ['price_id','prod_name','category','whole_price','ret_price','last_update']],
  account_prices: ['SELECT account,prod_name,whole_price,ret_price FROM account_prices ORDER BY account,prod_name',
                   ['account','prod_name','whole_price','ret_price']],
  ingredients:    ['SELECT ingr_id,name,unit,cost_cup,cost_pound,cup_pound,notes FROM ingredients ORDER BY name',
                   ['ingr_id','name','unit','cost_cup','cost_pound','cup_pound','notes']],
  daily_orders:   [`SELECT order_num,account,ordr_dt,prod_name,units,wprice,rprice,del_date,special_ords,postbake_adj,notes
                    FROM daily_orders ORDER BY ordr_dt,account,prod_name`,
                   ['order_num','account','ordr_dt','prod_name','units','wprice','rprice','del_date','special_ords','postbake_adj','notes']],
  recipes:        [`SELECT recipe_id,product,ingredient,sequence,qty,teaspoons,tablespoons,cups,pounds,rec_group,space,rectext FROM recipes ORDER BY product,sequence`,
                   ['recipe_id','product','ingredient','sequence','qty','teaspoons','tablespoons','cups','pounds','rec_group','space','rectext']],
  inventory:      ['SELECT prod_name,units,sod_inv,location FROM inventory ORDER BY prod_name',
                   ['prod_name','units','sod_inv','location']],
}

app.get('/api/export/:table', requireAuth, async (req, res) => {
  const cfg = EXPORTS[req.params.table]
  if (!cfg) return res.status(404).json({ error: 'Unknown table' })
  const { rows } = await query(cfg[0])
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.table}.csv"`)
  res.send(toCSV(rows, cfg[1]))
})

// ─── Import ────────────────────────────────────────────────────────────────

// Helpers to pull values from a normalized (lowercase keys) row
const col  = (r, k, d = null) => { const v = r[k] ?? d; return v === '' ? d : v }
const num  = (r, k, d = 0)    => parseFloat(col(r, k, d)) || d
const bool = (r, k, d = false) => {
  const v = col(r, k)
  if (v === null) return d
  return ['true','1','yes'].includes(String(v).toLowerCase())
}

// Parse Access date formats: DD-Mon-YY, DD-Mon-YYYY, or standard ISO
const MON = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}
const parseAccessDate = v => {
  if (!v || v === '00-Jan-00' || v === '00-Jan-1900') return null
  const m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (m) {
    const day = parseInt(m[1]), mon = MON[m[2].toLowerCase()]
    let yr = parseInt(m[3])
    if (yr < 100) yr += yr < 30 ? 2000 : 1900
    if (mon === undefined) return null
    return `${yr}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

app.post('/api/import/:table', requireAuth, async (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || !rows.length) return res.json({ imported: 0, errors: [] })

  const norm = rows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v?.toString().trim() ?? '']))
  )

  let client
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    let count = 0
    const errors = []

    for (const row of norm) {
      try {
        await client.query('SAVEPOINT row_sp')
        switch (req.params.table) {
          case 'products': {
            // Access uses 'divide_by' for divisor, 'inactive' (inverted) for active, 'prod_ID' for prod_id
            const divisor  = num(row,'divisor') || num(row,'divide_by',1)
            const pid      = col(row,'prod_id') ?? col(row,'prod_id')
            const inactive = bool(row,'inactive',false)
            const isActive = col(row,'active') !== null ? bool(row,'active',true) : !inactive
            await client.query(
              `INSERT INTO products(
                 prod_name,prod_id,prod_type,prod_group,subtype,multiplier,divisor,batch,active,gluten_free,
                 barcode,upc_code,label1,label2,label3,weight,color1,color2,color3,
                 ingsize,labelsize,weightsize,ingheight,whichlabel,labor_weight,webtype,notes)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
               ON CONFLICT(prod_name) DO UPDATE SET
                 prod_id=EXCLUDED.prod_id,prod_type=EXCLUDED.prod_type,prod_group=EXCLUDED.prod_group,
                 subtype=EXCLUDED.subtype,multiplier=EXCLUDED.multiplier,divisor=EXCLUDED.divisor,
                 batch=EXCLUDED.batch,active=EXCLUDED.active,gluten_free=EXCLUDED.gluten_free,
                 barcode=EXCLUDED.barcode,upc_code=EXCLUDED.upc_code,
                 label1=EXCLUDED.label1,label2=EXCLUDED.label2,label3=EXCLUDED.label3,
                 weight=EXCLUDED.weight,color1=EXCLUDED.color1,color2=EXCLUDED.color2,color3=EXCLUDED.color3,
                 ingsize=EXCLUDED.ingsize,labelsize=EXCLUDED.labelsize,weightsize=EXCLUDED.weightsize,
                 ingheight=EXCLUDED.ingheight,whichlabel=EXCLUDED.whichlabel,
                 labor_weight=EXCLUDED.labor_weight,webtype=EXCLUDED.webtype,notes=EXCLUDED.notes`,
              [
                col(row,'prod_name'),
                pid ? parseInt(pid) : null,
                col(row,'prod_type'), col(row,'prod_group'), col(row,'subtype'),
                num(row,'multiplier',1), divisor,
                bool(row,'batch'), isActive, bool(row,'gluten_free'),
                col(row,'barcode'), col(row,'upc_code') ?? col(row,'upc_code'),
                col(row,'label1'), col(row,'label2'), col(row,'label3'),
                col(row,'weight') ? num(row,'weight') : null,
                col(row,'color1'), col(row,'color2'), col(row,'color3'),
                col(row,'ingsize') ? num(row,'ingsize') : null,
                col(row,'labelsize') ? num(row,'labelsize') : null,
                col(row,'weightsize') ? num(row,'weightsize') : null,
                col(row,'ingheight') ? num(row,'ingheight') : null,
                col(row,'whichlabel'),
                col(row,'labor_weight') ? num(row,'labor_weight') : null,
                col(row,'webtype'), col(row,'notes')
              ]
            )
            await client.query(
              `INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING`,
              [col(row,'prod_name')]
            )
            break
          }
          case 'accounts': {
            // 'account' col in Access = numeric ID; 'market_fee' = our marketfee
            const mfee = num(row, 'marketfee') || num(row, 'market_fee')
            const aid  = col(row, 'acct_id') ?? col(row, 'account')
            await client.query(
              `INSERT INTO accounts(
                 name,acct_id,acctgrp,subcategory,category,route,sequence,region,day_of_week,
                 manager,owner,address,city,state,phone,fax,email,
                 del_inst,prefix,postord,entire_inv,wrap_muffins,print_inv,next_del,
                 marketfee,gas,tolls,balance,webname,sendweb,webstart,webend,adj_level,
                 open_dt,active,notes)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                      $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
               ON CONFLICT(name) DO UPDATE SET
                 acct_id=EXCLUDED.acct_id,acctgrp=EXCLUDED.acctgrp,subcategory=EXCLUDED.subcategory,
                 category=EXCLUDED.category,route=EXCLUDED.route,sequence=EXCLUDED.sequence,
                 region=EXCLUDED.region,day_of_week=EXCLUDED.day_of_week,
                 manager=EXCLUDED.manager,owner=EXCLUDED.owner,address=EXCLUDED.address,
                 city=EXCLUDED.city,state=EXCLUDED.state,phone=EXCLUDED.phone,
                 fax=EXCLUDED.fax,email=EXCLUDED.email,del_inst=EXCLUDED.del_inst,
                 prefix=EXCLUDED.prefix,postord=EXCLUDED.postord,entire_inv=EXCLUDED.entire_inv,
                 wrap_muffins=EXCLUDED.wrap_muffins,print_inv=EXCLUDED.print_inv,
                 next_del=EXCLUDED.next_del,marketfee=EXCLUDED.marketfee,
                 gas=EXCLUDED.gas,tolls=EXCLUDED.tolls,balance=EXCLUDED.balance,
                 webname=EXCLUDED.webname,sendweb=EXCLUDED.sendweb,
                 webstart=EXCLUDED.webstart,webend=EXCLUDED.webend,
                 adj_level=EXCLUDED.adj_level,open_dt=EXCLUDED.open_dt,
                 active=EXCLUDED.active,notes=EXCLUDED.notes`,
              [
                col(row,'name'), aid ? parseInt(aid) : null,
                col(row,'acctgrp'), col(row,'subcategory'), col(row,'category','wholesale'),
                col(row,'route'), num(row,'sequence'), col(row,'region'), col(row,'day_of_week'),
                col(row,'manager'), col(row,'owner'), col(row,'address'),
                col(row,'city'), col(row,'state'), col(row,'phone'), col(row,'fax'), col(row,'email'),
                col(row,'del_inst'), col(row,'prefix'), bool(row,'postord'),
                bool(row,'entire_inv'), bool(row,'wrap_muffins'), bool(row,'print_inv',true),
                parseAccessDate(col(row,'next_del')),
                mfee, num(row,'gas'), num(row,'tolls'), num(row,'balance'),
                col(row,'webname'), bool(row,'sendweb'),
                parseAccessDate(col(row,'webstart')), parseAccessDate(col(row,'webend')),
                num(row,'adj_level'), parseAccessDate(col(row,'open_dt')),
                bool(row,'active',true), col(row,'notes')
              ]
            )
            break
          }
          case 'prices': {
            const pname = col(row,'prod_name')
            if (!pname) break
            const pid = col(row,'price_id') ?? col(row,'record')
            const lu  = parseAccessDate(col(row,'last_update'))
            // Auto-create product placeholder if it doesn't exist yet
            await client.query(
              `INSERT INTO products(prod_name, active) VALUES($1, true) ON CONFLICT DO NOTHING`,
              [pname]
            )
            await client.query(
              `INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING`,
              [pname]
            )
            await client.query(
              `INSERT INTO prices(price_id,prod_name,category,whole_price,ret_price,last_update)
               VALUES($1,$2,$3,$4,$5,$6)
               ON CONFLICT(prod_name,category) DO UPDATE SET
                 price_id=EXCLUDED.price_id,
                 whole_price=EXCLUDED.whole_price,ret_price=EXCLUDED.ret_price,
                 last_update=EXCLUDED.last_update`,
              [pid ? parseInt(pid) : null,
               pname, col(row,'category','wholesale'),
               num(row,'whole_price'), num(row,'ret_price'),
               lu || new Date().toISOString().slice(0,10)]
            )
            break
          }
          case 'account_prices':
            await client.query(
              `INSERT INTO account_prices(account,prod_name,whole_price,ret_price,last_update)
               VALUES($1,$2,$3,$4,NOW())
               ON CONFLICT(account,prod_name) DO UPDATE SET
                 whole_price=EXCLUDED.whole_price,ret_price=EXCLUDED.ret_price,last_update=NOW()`,
              [col(row,'account'), col(row,'prod_name'), num(row,'whole_price'), num(row,'ret_price')]
            )
            break
          case 'ingredients': {
            // Access uses 'ingredient' for name, 'record' for ingr_id
            const iname = col(row,'name') ?? col(row,'ingredient')
            if (!iname) break
            const iid = col(row,'ingr_id') ?? col(row,'record')
            await client.query(
              `INSERT INTO ingredients(ingr_id,name,unit,cost_cup,cost_pound,cup_pound,notes)
               VALUES($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT(name) DO UPDATE SET
                 ingr_id=EXCLUDED.ingr_id,unit=EXCLUDED.unit,
                 cost_cup=EXCLUDED.cost_cup,cost_pound=EXCLUDED.cost_pound,
                 cup_pound=EXCLUDED.cup_pound,notes=EXCLUDED.notes`,
              [iid ? parseInt(iid) : null, iname, col(row,'unit'),
               col(row,'cost_cup') ? num(row,'cost_cup') : null,
               col(row,'cost_pound') ? num(row,'cost_pound') : null,
               col(row,'cup_pound') ? num(row,'cup_pound') : null,
               col(row,'notes')]
            )
            break
          }
          case 'daily_orders': {
            const pname = col(row,'prod_name')
            const aname = col(row,'account')
            if (!pname || !aname) break
            // Auto-create stubs if missing
            await client.query(`INSERT INTO products(prod_name,active) VALUES($1,true) ON CONFLICT DO NOTHING`, [pname])
            await client.query(`INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING`, [pname])
            await client.query(`INSERT INTO accounts(name,active) VALUES($1,true) ON CONFLICT DO NOTHING`, [aname])
            const onum = col(row,'order_num')
            await client.query(
              `INSERT INTO daily_orders(order_num,account,ordr_dt,prod_name,units,wprice,rprice,del_date,special_ords,postbake_adj,last_update)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT(order_num) WHERE order_num IS NOT NULL DO UPDATE SET
                 units=EXCLUDED.units,wprice=EXCLUDED.wprice,rprice=EXCLUDED.rprice,
                 del_date=EXCLUDED.del_date,special_ords=EXCLUDED.special_ords,
                 postbake_adj=EXCLUDED.postbake_adj,last_update=EXCLUDED.last_update`,
              [onum ? parseInt(onum) : null, aname,
               parseAccessDate(col(row,'ordr_dt')), pname,
               num(row,'units'), num(row,'wprice'), num(row,'rprice'),
               parseAccessDate(col(row,'del_date')),
               bool(row,'special_ords'), num(row,'postbake_adj'),
               parseAccessDate(col(row,'last_update')) || new Date().toISOString().slice(0,10)]
            )
            break
          }
          case 'recipes': {
            const rprod = col(row,'product') || col(row,'prod_name')
            if (!rprod) break
            const ringr = col(row,'ingredient') || null  // NULL for text-only lines
            const rrid  = col(row,'recipe_id') ?? col(row,'record')
            // Always ensure product exists (FK needed even for text-only lines)
            await client.query(`INSERT INTO products(prod_name,active) VALUES($1,true) ON CONFLICT DO NOTHING`, [rprod])
            await client.query(`INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING`, [rprod])
            if (ringr) {
              await client.query(`INSERT INTO ingredients(name) VALUES($1) ON CONFLICT DO NOTHING`, [ringr])
            }
            await client.query(
              `INSERT INTO recipes(recipe_id,product,ingredient,sequence,qty,teaspoons,tablespoons,cups,pounds,rec_group,space,rectext,last_update)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
               ON CONFLICT(product,ingredient) WHERE ingredient IS NOT NULL DO UPDATE SET
                 recipe_id=EXCLUDED.recipe_id,sequence=EXCLUDED.sequence,qty=EXCLUDED.qty,
                 teaspoons=EXCLUDED.teaspoons,tablespoons=EXCLUDED.tablespoons,
                 cups=EXCLUDED.cups,pounds=EXCLUDED.pounds,rec_group=EXCLUDED.rec_group,
                 space=EXCLUDED.space,rectext=EXCLUDED.rectext,last_update=NOW()`,
              [rrid ? parseInt(rrid) : null, rprod, ringr,
               num(row,'sequence'), num(row,'qty'),
               num(row,'teaspoons'), num(row,'tablespoons'), num(row,'cups'), num(row,'pounds'),
               bool(row,'rec_group'), bool(row,'space'),
               col(row,'rectext') ?? col(row,'recText')]
            )
            break
          }
          case 'inventory':
            await client.query(
              `INSERT INTO inventory(prod_name,units,sod_inv,location,lst_updt)
               VALUES($1,$2,$3,$4,NOW())
               ON CONFLICT(prod_name) DO UPDATE SET
                 units=EXCLUDED.units,sod_inv=EXCLUDED.sod_inv,location=EXCLUDED.location,lst_updt=NOW()`,
              [col(row,'prod_name'), num(row,'units'), num(row,'sod_inv'), col(row,'location')]
            )
            break
          default:
            throw new Error(`Unknown table: ${req.params.table}`)
        }
        count++
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {})
        errors.push({ error: e.message, row })
      }
    }

    await client.query('COMMIT')
    res.json({ imported: count, errors })
  } catch (e) {
    if (client) try { await client.query('ROLLBACK') } catch {}
    res.status(400).json({ error: e.message })
  } finally {
    if (client) client.release()
  }
})

// ─── Frontend (production) ─────────────────────────────────────────────────

app.use(express.static(join(__dirname, '../dist')))
app.get('*', (_req, res) => res.sendFile(join(__dirname, '../dist/index.html')))

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Bakery server running on port ${PORT}`)
})
