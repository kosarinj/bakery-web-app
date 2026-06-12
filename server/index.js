import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pool, { query } from './db.js'
import { openMDB, makeTableGetter, getTableInfo, IMPORTERS } from './mdb-import.js'

const PgStore = connectPgSimple(session)
const __dirname = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = express()
const PORT = process.env.PORT || 3002

app.set('trust proxy', 1)
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.text({ limit: '200mb', type: 'text/csv' }))
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

async function logActivity(req, action, details = '') {
  try {
    await query(
      `INSERT INTO activity_log(username, action, details, ip) VALUES($1,$2,$3,$4)`,
      [req.session?.user?.username || 'system', action, details, req.ip]
    )
  } catch {}
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
    await logActivity(req, 'login', `User logged in`)
    res.json({ success: true, user: req.session.user })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

// ─── User Management ───────────────────────────────────────────────────────

app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, username, role, created_at FROM users ORDER BY username')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/users', requireAuth, async (req, res) => {
  const { username, password, role } = req.body
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO users(username, password_hash, role) VALUES($1,$2,$3) RETURNING id, username, role, created_at`,
      [username.trim(), hash, role || 'user']
    )
    res.json(rows[0])
  } catch (e) {
    res.status(400).json({ error: e.message.includes('unique') ? 'Username already exists' : e.message })
  }
})

app.patch('/api/users/:id/password', requireAuth, async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'password required' })
  try {
    const hash = await bcrypt.hash(password, 10)
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/users/:id', requireAuth, async (req, res) => {
  if (parseInt(req.params.id) === req.session.user.id) return res.status(400).json({ error: "Can't delete your own account" })
  try {
    await query('DELETE FROM users WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
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
    const { rows } = await query(`
      SELECT p.*,
             EXISTS(SELECT 1 FROM recipes r WHERE r.product = p.prod_name) AS has_recipe
      FROM products p
      ${all ? '' : 'WHERE p.active = true'}
      ORDER BY p.prod_group, p.prod_name
    `)
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
    'subtype','ingsize','labelsize','weightsize','ingheight','whichlabel','labor_weight','webtype','gluten_free','is_extra'
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

// ─── Daily Inventory ───────────────────────────────────────────────────────

app.get('/api/daily-inventory/locations', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT DISTINCT location FROM daily_inventory ORDER BY location`)
    res.json(rows.map(r => r.location))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/daily-inventory', requireAuth, async (req, res) => {
  const { date, location } = req.query
  const d = date || new Date().toISOString().slice(0, 10)
  try {
    const { rows } = location
      ? await query(`SELECT di.*, p.prod_group FROM daily_inventory di LEFT JOIN products p ON p.prod_name=di.prod_name WHERE di.inv_date=$1 AND di.location=$2 ORDER BY di.scanned_at DESC`, [d, location])
      : await query(`SELECT di.*, p.prod_group FROM daily_inventory di LEFT JOIN products p ON p.prod_name=di.prod_name WHERE di.inv_date=$1 ORDER BY di.location, di.scanned_at DESC`, [d])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/daily-inventory', requireAuth, async (req, res) => {
  const { location, inv_date, prod_name, left_qty, return_qty, override } = req.body
  if (!location || !prod_name) return res.status(400).json({ error: 'location and prod_name required' })
  try {
    const { rows } = await query(
      `INSERT INTO daily_inventory(location,inv_date,prod_name,left_qty,return_qty,override)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [location, inv_date || new Date().toISOString().slice(0,10), prod_name, left_qty ?? 0, return_qty ?? 0, override ?? false]
    )
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
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

// Set delivery date for all orders of an account on a given order date
app.patch('/api/orders/del-date', requireAuth, async (req, res) => {
  const { ordr_dt, account, del_date } = req.body
  try {
    await query(
      `UPDATE daily_orders SET del_date=$1, last_update=NOW() WHERE ordr_dt=$2 AND account=$3`,
      [del_date || null, ordr_dt, account]
    )
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Copy orders from one date to another (skips account+product pairs already entered on to_date)
// Optional: accounts array limits which accounts are copied
app.post('/api/orders/copy', requireAuth, async (req, res) => {
  const { from_date, to_date, accounts } = req.body
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' })
  const hasAcctFilter = Array.isArray(accounts) && accounts.length > 0
  try {
    const { rows } = await query(`
      INSERT INTO daily_orders(prod_name, account, units, wprice, rprice, ordr_dt, del_date, last_update)
      SELECT f.prod_name, f.account,
             GREATEST(0, f.units
               - COALESCE(f.special_ords, 0)
               - COALESCE(f.postbake_adj, 0)) AS units,
             f.wprice, f.rprice,
             $2::date,
             $2::date + COALESCE(a.postord::int, 0),
             NOW()
      FROM daily_orders f
      JOIN accounts a ON a.name = f.account
      WHERE f.ordr_dt = $1
        ${hasAcctFilter ? 'AND f.account = ANY($3::text[])' : ''}
        AND GREATEST(0, f.units
              - COALESCE(f.special_ords, 0)
              - COALESCE(f.postbake_adj, 0)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM daily_orders e
          WHERE e.prod_name = f.prod_name
            AND e.account = f.account
            AND e.ordr_dt = $2::date
        )
      RETURNING *
    `, hasAcctFilter ? [from_date, to_date, accounts] : [from_date, to_date])
    await logActivity(req, 'repeat_orders', `Copied ${rows.length} orders from ${from_date} to ${to_date}`)
    res.json({ copied: rows.length, rows })
  } catch (e) {
    await logActivity(req, 'repeat_orders_error', `Error copying orders from ${from_date} to ${to_date}: ${e.message}`)
    res.status(400).json({ error: e.message })
  }
})

// Orders summary: units per product for a given date (for bake list / have-need)
app.get('/api/dashboard/revenue-history', requireAuth, async (req, res) => {
  const years = Math.min(Math.max(parseInt(req.query.years) || 5, 1), 30)
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', tix_date), 'YYYY-MM') AS month,
        DATE_PART('year', tix_date)::int                   AS year,
        SUM(total) AS billed,
        SUM(paid)  AS collected
      FROM track_tix
      WHERE tix_date >= CURRENT_DATE - ($1 || ' years')::interval
      GROUP BY 1, 2
      ORDER BY 1
    `, [years])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard/yoy', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      WITH ranked_years AS (
        SELECT DISTINCT EXTRACT(YEAR FROM ordr_dt)::int AS yr
        FROM daily_orders ORDER BY yr DESC LIMIT 2
      ),
      cur_yr  AS (SELECT MAX(yr) AS y FROM ranked_years),
      prev_yr AS (SELECT MIN(yr) AS y FROM ranked_years)
      SELECT
        EXTRACT(MONTH FROM ordr_dt)::int AS month_num,
        (SELECT y FROM cur_yr)::int       AS cur_year,
        (SELECT y FROM prev_yr)::int      AS prev_year,
        SUM(CASE WHEN EXTRACT(YEAR FROM ordr_dt)=(SELECT y FROM cur_yr)  THEN wprice*units ELSE 0 END) AS cur_revenue,
        SUM(CASE WHEN EXTRACT(YEAR FROM ordr_dt)=(SELECT y FROM prev_yr) THEN wprice*units ELSE 0 END) AS prev_revenue
      FROM daily_orders
      WHERE EXTRACT(YEAR FROM ordr_dt) IN (SELECT yr FROM ranked_years)
      GROUP BY 1, cur_year, prev_year ORDER BY 1
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard/revenue-trend', requireAuth, async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90)
  try {
    const { rows } = await query(`
      SELECT ordr_dt::text AS date,
             SUM(wprice * units)  AS revenue,
             SUM(units)           AS units,
             COUNT(DISTINCT account) AS accounts
      FROM daily_orders
      WHERE ordr_dt IN (
        SELECT DISTINCT ordr_dt FROM daily_orders ORDER BY ordr_dt DESC LIMIT $1
      )
      GROUP BY ordr_dt ORDER BY ordr_dt
    `, [days])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard/by-type', requireAuth, async (req, res) => {
  try {
    const { date } = req.query
    let dateVal = date
    if (!dateVal) {
      const { rows: mx } = await query('SELECT MAX(ordr_dt)::text AS d FROM daily_orders')
      dateVal = mx[0]?.d || new Date().toISOString().slice(0, 10)
    }
    const { rows } = await query(`
      SELECT COALESCE(p.prod_type, 'Other') AS type,
             SUM(o.units) AS units,
             SUM(o.wprice * o.units) AS revenue
      FROM daily_orders o
      JOIN products p ON p.prod_name = o.prod_name
      WHERE o.ordr_dt = $1
      GROUP BY p.prod_type ORDER BY units DESC
    `, [dateVal])
    res.json({ date: dateVal, data: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard/top-accounts', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT o.account,
             SUM(o.units)            AS total_units,
             SUM(o.wprice * o.units) AS revenue,
             COUNT(DISTINCT o.ordr_dt) AS order_days
      FROM daily_orders o
      WHERE o.ordr_dt >= (SELECT COALESCE(MAX(ordr_dt), CURRENT_DATE) FROM daily_orders) - 30
      GROUP BY o.account ORDER BY revenue DESC LIMIT 8
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const dateParam = req.query.date || null
  const [accts, prods, orders] = await Promise.all([
    query('SELECT COUNT(*) FROM accounts WHERE active=true'),
    query('SELECT COUNT(*) FROM products WHERE active=true'),
    dateParam
      ? query('SELECT COUNT(DISTINCT account) AS orders_today, COUNT(*) AS order_lines FROM daily_orders WHERE ordr_dt=$1', [dateParam])
      : query('SELECT COUNT(DISTINCT account) AS orders_today, COUNT(*) AS order_lines FROM daily_orders WHERE ordr_dt=(SELECT MAX(ordr_dt) FROM daily_orders)'),
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
  const fields = ['name', 'unit', 'cost_cup', 'cost_pound', 'cup_pound', 'notes']
  const updates = [], vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  if (!updates.length) return res.json({ success: true })
  vals.push(req.params.id)
  await query(`UPDATE ingredients SET ${updates.join(',')} WHERE id=$${vals.length}`, vals)
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
    await logActivity(req, 'recipe_add', `Added ${ingredient} to recipe for ${product}`)
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
  await logActivity(req, 'recipe_edit', `Updated recipe row ${req.params.id}: ${Object.keys(req.body).join(', ')}`)
  res.json({ success: true })
})

app.delete('/api/recipes/:id', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT product, ingredient FROM recipes WHERE id=$1', [req.params.id])
  await query('DELETE FROM recipes WHERE id=$1', [req.params.id])
  if (rows.length) await logActivity(req, 'recipe_delete', `Removed ${rows[0].ingredient} from recipe for ${rows[0].product}`)
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

// ─── Special Orders ────────────────────────────────────────────────────────

app.get('/api/spec-orders/locations', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT location FROM spec_orders WHERE location IS NOT NULL AND location <> '' ORDER BY location`
  )
  res.json(rows.map(r => r.location))
})

app.get('/api/spec-orders/dates', requireAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT ordr_dt::text AS date, COUNT(*) AS count
    FROM spec_orders
    GROUP BY ordr_dt ORDER BY ordr_dt DESC
  `)
  res.json(rows)
})

app.get('/api/spec-orders', requireAuth, async (req, res) => {
  const { date, account } = req.query
  const conds = [], vals = []
  if (date)    { vals.push(date);    conds.push(`s.ordr_dt = $${vals.length}`) }
  if (account) { vals.push(account); conds.push(`s.account = $${vals.length}`) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  try {
    const { rows } = await query(`
      SELECT s.*, p.prod_type, p.prod_group
      FROM spec_orders s
      LEFT JOIN products p ON p.prod_name = s.prod_name
      ${where}
      ORDER BY s.ordr_dt, s.account, s.prod_name
    `, vals)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/spec-orders', requireAuth, async (req, res) => {
  const { account, cust_name, location, ordr_dt, del_date, prod_name, units, price, phone, notes } = req.body
  try {
    const { rows } = await query(`
      INSERT INTO spec_orders(account,cust_name,location,ordr_dt,del_date,prod_name,units,price,phone,notes,last_update)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *
    `, [account, cust_name || null, location, ordr_dt, del_date || null, prod_name, units || 0, price || 0, phone, notes])

    // Sync special_ords onto the matching daily_orders row (same account+product+date)
    if (account && prod_name && ordr_dt && (units || 0) > 0) {
      await query(`
        UPDATE daily_orders
        SET special_ords = COALESCE(special_ords, 0) + $1, last_update = NOW()
        WHERE account = $2 AND prod_name = $3 AND ordr_dt = $4::date
      `, [units || 0, account, prod_name, ordr_dt])
    }

    res.json(rows[0])
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.patch('/api/spec-orders/:id', requireAuth, async (req, res) => {
  const fields = ['account','cust_name','location','ordr_dt','del_date','prod_name','units','price','phone','notes']
  const updates = ['last_update=NOW()'], vals = []
  fields.forEach(f => { if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f}=$${vals.length}`) } })
  vals.push(req.params.id)
  try {
    // Fetch old row first so we can compute the unit delta
    const { rows: old } = await query('SELECT account, prod_name, ordr_dt, units FROM spec_orders WHERE id=$1', [req.params.id])
    await query(`UPDATE spec_orders SET ${updates.join(',')} WHERE id=$${vals.length}`, vals)

    // Sync special_ords delta onto daily_orders
    if (old.length && req.body.units !== undefined) {
      const oldUnits = parseFloat(old[0].units) || 0
      const newUnits = parseFloat(req.body.units) || 0
      const delta = newUnits - oldUnits
      const row = old[0]
      const acct    = req.body.account    || row.account
      const prod    = req.body.prod_name  || row.prod_name
      const ordrDt  = req.body.ordr_dt    || row.ordr_dt
      if (delta !== 0 && acct && prod && ordrDt) {
        await query(`
          UPDATE daily_orders
          SET special_ords = GREATEST(0, COALESCE(special_ords, 0) + $1), last_update = NOW()
          WHERE account = $2 AND prod_name = $3 AND ordr_dt = $4::date
        `, [delta, acct, prod, ordrDt])
      }
    }
    res.json({ success: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.delete('/api/spec-orders/:id', requireAuth, async (req, res) => {
  try {
    // Fetch before deleting so we can subtract from daily_orders
    const { rows: old } = await query('SELECT account, prod_name, ordr_dt, units FROM spec_orders WHERE id=$1', [req.params.id])
    await query('DELETE FROM spec_orders WHERE id=$1', [req.params.id])
    if (old.length) {
      const { account, prod_name, ordr_dt, units } = old[0]
      const u = parseFloat(units) || 0
      if (u > 0 && account && prod_name && ordr_dt) {
        await query(`
          UPDATE daily_orders
          SET special_ords = GREATEST(0, COALESCE(special_ords, 0) - $1), last_update = NOW()
          WHERE account = $2 AND prod_name = $3 AND ordr_dt = $4::date
        `, [u, account, prod_name, ordr_dt])
      }
    }
    res.json({ success: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Copy special orders from one date to another (skip if order already exists for that account+product+date)
app.post('/api/spec-orders/copy', requireAuth, async (req, res) => {
  const { from_date, to_date, accounts, location } = req.body
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' })
  const hasAcctFilter = Array.isArray(accounts) && accounts.length > 0
  const hasLocFilter  = !!location
  const params = [from_date, to_date]
  let extraWhere = ''
  if (hasLocFilter)  { params.push(location);  extraWhere += ` AND s.location = $${params.length}` }
  if (hasAcctFilter) { params.push(accounts);  extraWhere += ` AND s.account = ANY($${params.length}::text[])` }
  try {
    const { rows } = await query(`
      INSERT INTO spec_orders(account,cust_name,location,ordr_dt,del_date,prod_name,units,price,phone,notes,last_update)
      SELECT s.account, s.cust_name, s.location, $2::date, s.del_date, s.prod_name, s.units, s.price, s.phone, s.notes, NOW()
      FROM spec_orders s
      WHERE s.ordr_dt = $1
        ${extraWhere}
        AND NOT EXISTS (
          SELECT 1 FROM spec_orders e WHERE e.account=s.account AND e.prod_name=s.prod_name AND e.ordr_dt=$2::date
        )
      RETURNING *
    `, params)
    await logActivity(req, 'repeat_spec_orders', `Copied ${rows.length} special orders from ${from_date} to ${to_date}`)
    res.json({ copied: rows.length, rows })
  } catch (e) {
    await logActivity(req, 'repeat_spec_orders_error', `Error copying special orders from ${from_date} to ${to_date}: ${e.message}`)
    res.status(400).json({ error: e.message })
  }
})

// ─── Billing / Track Tickets ───────────────────────────────────────────────

// Generate bills for a delivery date — creates/updates track_tix from orders
app.post('/api/billing/generate', requireAuth, async (req, res) => {
  const { del_date } = req.body
  if (!del_date) return res.status(400).json({ error: 'del_date required' })
  try {
    // Compute totals per account for that delivery date
    const { rows: totals } = await query(`
      SELECT o.account,
             SUM(o.wprice * o.units) AS total,
             SUM(o.units)            AS total_units,
             COUNT(*)                AS line_items
      FROM daily_orders o
      WHERE o.del_date = $1 OR o.ordr_dt = $1
      GROUP BY o.account
      ORDER BY o.account
    `, [del_date])

    let created = 0, updated = 0
    for (const row of totals) {
      const result = await query(`
        INSERT INTO track_tix(tix_date, account, total, last_update)
        VALUES($1, $2, $3, NOW())
        ON CONFLICT(tix_date, account) DO UPDATE SET
          total=EXCLUDED.total, last_update=NOW()
        RETURNING (xmax = 0) AS inserted
      `, [del_date, row.account, row.total])
      result.rows[0]?.inserted ? created++ : updated++
    }
    res.json({ created, updated, accounts: totals.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// List tickets — supports date range and account filter
app.get('/api/billing/tickets', requireAuth, async (req, res) => {
  const { from, to, account, unpaid_only } = req.query
  const conditions = ['1=1']
  const vals = []
  if (from)   { vals.push(from);    conditions.push(`t.tix_date >= $${vals.length}`) }
  if (to)     { vals.push(to);      conditions.push(`t.tix_date <= $${vals.length}`) }
  if (account){ vals.push(account); conditions.push(`t.account = $${vals.length}`) }
  if (unpaid_only === '1') conditions.push('t.total > t.paid')
  try {
    const { rows } = await query(`
      SELECT t.*, (t.total - t.paid) AS outstanding,
             a.route, a.acctgrp, a.category
      FROM track_tix t
      LEFT JOIN accounts a ON a.name = t.account
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.tix_date DESC, t.account
    `, vals)
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Update paid amount for a ticket
app.patch('/api/billing/tickets/:id', requireAuth, async (req, res) => {
  const { paid, notes } = req.body
  try {
    await query(
      `UPDATE track_tix SET paid=$1, notes=$2, last_update=NOW() WHERE id=$3`,
      [paid, notes, req.params.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Pay in full — set paid = total for selected tickets
app.post('/api/billing/pay-full', requireAuth, async (req, res) => {
  const { ids } = req.body   // array of ticket IDs
  if (!Array.isArray(ids) || !ids.length) return res.json({ updated: 0 })
  try {
    const { rowCount } = await query(
      `UPDATE track_tix SET paid=total, last_update=NOW() WHERE id = ANY($1::int[])`,
      [ids]
    )
    res.json({ updated: rowCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Aged receivables summary
app.get('/api/billing/aged', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const { rows } = await query(`
      SELECT account,
             SUM(total - paid)                                           AS total_outstanding,
             SUM(CASE WHEN tix_date >= CURRENT_DATE - 30  THEN total - paid ELSE 0 END) AS age_0_30,
             SUM(CASE WHEN tix_date  < CURRENT_DATE - 30
                       AND tix_date >= CURRENT_DATE - 60  THEN total - paid ELSE 0 END) AS age_31_60,
             SUM(CASE WHEN tix_date  < CURRENT_DATE - 60
                       AND tix_date >= CURRENT_DATE - 90  THEN total - paid ELSE 0 END) AS age_61_90,
             SUM(CASE WHEN tix_date  < CURRENT_DATE - 90  THEN total - paid ELSE 0 END) AS age_90_plus,
             MAX(tix_date)                                               AS last_bill_date
      FROM track_tix
      WHERE total > paid
      GROUP BY account
      ORDER BY total_outstanding DESC
    `, [])
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Billing Excel Export ─────────────────────────────────────────────────

// Delivery tickets export — one sheet per account
app.get('/api/billing/export/tickets', requireAuth, async (req, res) => {
  const { del_date, account: acctFilter } = req.query
  if (!del_date) return res.status(400).json({ error: 'del_date required' })
  try {
    const ExcelJS = (await import('exceljs')).default

    // Load bakery name/address from settings
    const { rows: sRows } = await query(`SELECT setting, value FROM settings WHERE setting IN ('bakery_name','bakery_address','bakery_phone')`)
    const settings = Object.fromEntries(sRows.map(r => [r.setting, r.value]))
    const bakeryName = settings.bakery_name || "Meredith's Country Bakery"
    const bakeryAddr = settings.bakery_address || '415 Rte 28, Kingston, NY 12401'
    const bakeryPhone = settings.bakery_phone || '(845) 331-4318'

    // Get accounts for this date ordered by route/sequence
    const acctCond = acctFilter ? `AND TRIM(o.account) = $2` : ''
    const acctVals = acctFilter ? [del_date, acctFilter] : [del_date]
    const { rows: accounts } = await query(`
      SELECT DISTINCT TRIM(o.account) AS account, a.route, a.sequence
      FROM daily_orders o
      LEFT JOIN accounts a ON TRIM(a.name) = TRIM(o.account)
      WHERE (o.del_date = $1 OR o.ordr_dt = $1) AND o.units > 0
      ${acctCond}
      ORDER BY a.route NULLS LAST, a.sequence NULLS LAST, TRIM(o.account)
    `, acctVals)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bakery Manager'

    for (const acct of accounts) {
      // Get line items ordered by prod_group then prod_name
      const { rows: lines } = await query(`
        SELECT o.prod_name, o.units, o.wprice, o.rprice, o.special_ords,
               p.prod_group, p.prod_type
        FROM daily_orders o
        LEFT JOIN products p ON p.prod_name = o.prod_name
        WHERE (o.del_date = $1 OR o.ordr_dt = $1)
          AND TRIM(o.account) = $2
          AND o.units > 0
        ORDER BY p.prod_group NULLS LAST, o.prod_name
      `, [del_date, acct.account])

      const sheetName = acct.account.replace(/[*?:/\\[\]]/g, '').slice(0, 31)
      const ws = wb.addWorksheet(sheetName)

      // Column widths (A=6, B=22, C=12, D=12, E=14, cols F-J = second column set)
      ws.getColumn(1).width = 7
      ws.getColumn(2).width = 22
      ws.getColumn(3).width = 13
      ws.getColumn(4).width = 13
      ws.getColumn(5).width = 16

      const hdrFont = { name: 'Arial', size: 8, bold: true }

      // Header block (rows 1-4, col E)
      ws.getCell('E1').value = bakeryName + ' Invoice'
      ws.getCell('E2').value = bakeryAddr.split(',')[0] || '415 Rte 28'
      ws.getCell('E3').value = bakeryAddr.split(',').slice(1).join(',').trim() || 'Kingston, NY 12401'
      ws.getCell('E4').value = bakeryPhone
      ws.getCell('E1').font = { name: 'Arial', size: 9, bold: true }
      ws.getCell('E2').font = hdrFont; ws.getCell('E3').font = hdrFont; ws.getCell('E4').font = hdrFont

      // Date and account (rows 5-6, col A)
      ws.getCell('A5').value = del_date
      ws.getCell('A5').numFmt = 'm/d/yyyy'
      ws.getCell('A5').alignment = { horizontal: 'left' }
      ws.getCell('A6').value = acct.account
      ws.getCell('A6').font = { name: 'Arial', size: 9, bold: true }

      // Column headers row 7
      const hdrRow = ws.getRow(7)
      hdrRow.getCell(1).value = 'Units'
      hdrRow.getCell(2).value = 'Product'
      hdrRow.getCell(3).value = 'Wholesale/Unit'
      hdrRow.getCell(4).value = 'Retail/Unit'
      hdrRow.getCell(5).value = 'Total Wholesale'
      hdrRow.eachCell(c => {
        c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF8B0000' } }
        c.border = { bottom: { style: 'thin' } }
      })

      let row = 8
      let lastGroup = null
      let groupSubtot = 0
      let grandTotal = 0
      let grandUnits = 0

      for (const line of lines) {
        const grp = line.prod_group || ''
        if (lastGroup !== null && grp !== lastGroup) {
          // print group subtotal
          const sr = ws.getRow(row)
          sr.getCell(1).value = groupSubtot
          sr.getCell(1).font = { name: 'Arial', size: 8, bold: true, italic: true }
          sr.getCell(1).alignment = { horizontal: 'right' }
          sr.getCell(2).value = `  ── ${lastGroup} subtotal`
          sr.getCell(2).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF666666' } }
          row++
          groupSubtot = 0
        }

        const units = (parseFloat(line.units) || 0) - (parseFloat(line.special_ords) || 0)
        const wp = parseFloat(line.wprice) || 0
        const rp = parseFloat(line.rprice) || 0
        const tot = wp * units

        const dr = ws.getRow(row)
        dr.getCell(1).value = units
        dr.getCell(2).value = line.prod_name
        dr.getCell(3).value = wp
        dr.getCell(4).value = rp
        dr.getCell(5).value = tot
        dr.getCell(3).numFmt = '$#,##0.00'
        dr.getCell(4).numFmt = '$#,##0.00'
        dr.getCell(5).numFmt = '$#,##0.00'
        dr.eachCell({ includeEmpty: false }, c => { c.font = hdrFont })

        groupSubtot += units
        grandTotal += tot
        grandUnits += units
        lastGroup = grp
        row++
      }

      // Last group subtotal
      if (lastGroup !== null) {
        const sr = ws.getRow(row)
        sr.getCell(1).value = groupSubtot
        sr.getCell(1).font = { name: 'Arial', size: 8, bold: true, italic: true }
        sr.getCell(1).alignment = { horizontal: 'right' }
        sr.getCell(2).value = `  ── ${lastGroup} subtotal`
        sr.getCell(2).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF666666' } }
        row++
      }

      // Grand total row
      row++
      const tr = ws.getRow(row)
      tr.getCell(1).value = `Total   #${grandUnits}`
      tr.getCell(5).value = grandTotal
      tr.getCell(5).numFmt = '$#,###,##0.00'
      tr.eachCell({ includeEmpty: false }, c => { c.font = { name: 'Arial', size: 10, bold: true } })
      tr.getCell(1).border = { top: { style: 'thin' } }
      tr.getCell(5).border = { top: { style: 'double' } }
    }

    const filename = `tickets_${del_date}${acctFilter ? '_' + acctFilter.replace(/\s+/g, '_') : ''}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('tickets export error:', e)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// Inventory sheets export — one sheet per account, 3-column product grid
app.get('/api/billing/export/inventory', requireAuth, async (req, res) => {
  const { del_date, account: acctFilter } = req.query
  if (!del_date) return res.status(400).json({ error: 'del_date required' })
  try {
    const ExcelJS = (await import('exceljs')).default

    const { rows: sRows } = await query(`SELECT setting, value FROM settings WHERE setting IN ('bakery_name')`)
    const settings = Object.fromEntries(sRows.map(r => [r.setting, r.value]))
    const bakeryName = settings.bakery_name || "Meredith's Country Bakery"

    // Accounts ordered by route/sequence
    const acctCond = acctFilter ? `AND TRIM(o.account) = $2` : ''
    const acctVals = acctFilter ? [del_date, acctFilter] : [del_date]
    const { rows: accounts } = await query(`
      SELECT DISTINCT TRIM(o.account) AS account, a.route, a.sequence, a.category
      FROM daily_orders o
      LEFT JOIN accounts a ON TRIM(a.name) = TRIM(o.account)
      WHERE (o.del_date = $1 OR o.ordr_dt = $1) AND o.units > 0
      ${acctCond}
      ORDER BY a.route NULLS LAST, a.sequence NULLS LAST, TRIM(o.account)
    `, acctVals)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bakery Manager'

    for (const acct of accounts) {
      // Get distinct product groups in order for this account
      const { rows: typeRows } = await query(`
        SELECT DISTINCT COALESCE(p.prod_group, p.prod_type, 'Other') AS grp_key
        FROM daily_orders o
        JOIN products p ON p.prod_name = o.prod_name
        WHERE (o.del_date = $1 OR o.ordr_dt = $1)
          AND TRIM(o.account) = $2
          AND o.units > 0
        ORDER BY grp_key
      `, [del_date, acct.account])

      const sheetName = acct.account.replace(/[*?:/\\[\]]/g, '').slice(0, 31)
      const ws = wb.addWorksheet(sheetName)

      // Set column widths: 15 columns, groups of 5 (name, price, blank, R, L)
      for (let c = 1; c <= 15; c++) {
        if (c % 5 === 1) ws.getColumn(c).width = 18  // product name
        else if (c % 5 === 2) ws.getColumn(c).width = 9  // price
        else if (c % 5 === 3) ws.getColumn(c).width = 3  // blank
        else ws.getColumn(c).width = 5  // R or L box
      }

      const hdrFont = { name: 'Arial', size: 8, bold: true }
      const thin = { style: 'thin' }
      const allBorders = { top: thin, bottom: thin, left: thin, right: thin }

      // Sheet header (rows 1-2)
      ws.getCell('F1').value = `       ${bakeryName} Inventory`
      ws.getCell('F2').value = `       ${acct.account}, ${del_date}`
      ws.getCell('F1').font = { name: 'Arial', size: 10, bold: true }
      ws.getCell('F2').font = { name: 'Arial', size: 9, bold: true }

      let moveRow = 3

      for (const typeRow of typeRows) {
        const typeLabel = typeRow.grp_key.toUpperCase()

        // Type header row (red)
        const tr = ws.getRow(moveRow)
        tr.getCell(1).value = typeLabel
        tr.getCell(4).value = 'R'; tr.getCell(5).value = 'L'
        tr.getCell(9).value = 'R'; tr.getCell(10).value = 'L'
        tr.getCell(14).value = 'R'; tr.getCell(15).value = 'L'
        for (let c = 1; c <= 15; c++) {
          tr.getCell(c).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFCC0000' } }
        }
        const typeRowNum = moveRow
        moveRow++

        // Get products for this group
        const { rows: prods } = await query(`
          SELECT o.prod_name, o.units, o.wprice,
                 COALESCE(pr.whole_price, o.wprice) AS whole_price
          FROM daily_orders o
          LEFT JOIN products p ON p.prod_name = o.prod_name
          LEFT JOIN prices pr ON pr.prod_name = o.prod_name AND pr.category = $3
          WHERE (o.del_date = $1 OR o.ordr_dt = $1)
            AND TRIM(o.account) = $2
            AND COALESCE(p.prod_group, p.prod_type, 'Other') = $4
            AND o.units > 0
          ORDER BY o.prod_name
        `, [del_date, acct.account, acct.category || 'wholesale', typeRow.grp_key])

        let moveCol = 1  // starts at 1, advances by 5, wraps at 16
        let typeTotal = 0

        for (const prod of prods) {
          const units = parseFloat(prod.units) || 0
          const price = parseFloat(prod.whole_price || prod.wprice) || 0
          typeTotal += units

          const pr = ws.getRow(moveRow)
          pr.getCell(moveCol).value = prod.prod_name
          pr.getCell(moveCol + 1).value = price > 0 ? price : null
          if (price > 0) pr.getCell(moveCol + 1).numFmt = '$###0.00'

          // Green highlight if units > 0
          if (units > 0) {
            pr.getCell(moveCol).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF006400' } }
          } else {
            pr.getCell(moveCol).font = hdrFont
          }
          pr.getCell(moveCol + 1).font = hdrFont

          // Borders on full row A:O
          for (let c = 1; c <= 15; c++) {
            pr.getCell(c).border = allBorders
          }

          moveCol += 5
          if (moveCol === 16) {
            moveRow++
            moveCol = 1
          }
        }

        // Finish any partial row
        if (moveCol > 1) moveRow++

        // Update type header with total
        ws.getRow(typeRowNum).getCell(1).value = `${typeLabel}: ${typeTotal}`
      }
    }

    const filename = `inventory_${del_date}${acctFilter ? '_' + acctFilter.replace(/\s+/g, '_') : ''}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('inventory export error:', e)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// Packing sheets export — same as tickets but no price/total columns, "Packing Sheet" title
app.get('/api/billing/export/packing', requireAuth, async (req, res) => {
  const { del_date, account: acctFilter } = req.query
  if (!del_date) return res.status(400).json({ error: 'del_date required' })
  try {
    const ExcelJS = (await import('exceljs')).default

    const { rows: sRows } = await query(`SELECT setting, value FROM settings WHERE setting IN ('bakery_name','bakery_address','bakery_phone')`)
    const settings = Object.fromEntries(sRows.map(r => [r.setting, r.value]))
    const bakeryName = settings.bakery_name || "Meredith's Country Bakery"
    const bakeryAddr = settings.bakery_address || '415 Rte 28, Kingston, NY 12401'
    const bakeryPhone = settings.bakery_phone || '(845) 331-4318'

    const acctCond = acctFilter ? `AND TRIM(o.account) = $2` : ''
    const acctVals = acctFilter ? [del_date, acctFilter] : [del_date]
    const { rows: accounts } = await query(`
      SELECT DISTINCT TRIM(o.account) AS account, a.route, a.sequence, a.acctgrp
      FROM daily_orders o
      LEFT JOIN accounts a ON TRIM(a.name) = TRIM(o.account)
      WHERE (o.del_date = $1 OR o.ordr_dt = $1) AND o.units > 0
      ${acctCond}
      ORDER BY a.route NULLS LAST, a.sequence NULLS LAST, TRIM(o.account)
    `, acctVals)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bakery Manager'
    const hdrFont = { name: 'Arial', size: 8, bold: true }

    for (const acct of accounts) {
      const { rows: lines } = await query(`
        SELECT o.prod_name, o.units, o.wprice, o.rprice, o.special_ords, p.prod_group
        FROM daily_orders o
        LEFT JOIN products p ON p.prod_name = o.prod_name
        WHERE (o.del_date = $1 OR o.ordr_dt = $1)
          AND TRIM(o.account) = $2
          AND o.units > 0
        ORDER BY p.prod_group NULLS LAST, o.prod_name
      `, [del_date, acct.account])

      const sheetName = acct.account.replace(/[*?:/\\[\]]/g, '').slice(0, 31)
      const ws = wb.addWorksheet(sheetName)
      ws.getColumn(1).width = 7
      ws.getColumn(2).width = 22
      ws.getColumn(3).width = 13
      ws.getColumn(4).width = 13

      ws.getCell('E1').value = bakeryName + ' Packing Sheet'
      ws.getCell('E2').value = bakeryAddr.split(',')[0] || '415 Rte 28'
      ws.getCell('E3').value = bakeryAddr.split(',').slice(1).join(',').trim() || 'Kingston, NY 12401'
      ws.getCell('E4').value = bakeryPhone
      ;['E1','E2','E3','E4'].forEach(c => { ws.getCell(c).font = hdrFont })
      ws.getCell('E1').font = { name: 'Arial', size: 9, bold: true }

      ws.getCell('A5').value = del_date; ws.getCell('A5').numFmt = 'm/d/yyyy'
      ws.getCell('A5').alignment = { horizontal: 'left' }
      ws.getCell('A6').value = acct.account
      ws.getCell('A6').font = { name: 'Arial', size: 9, bold: true }

      const hdrRow = ws.getRow(7)
      hdrRow.getCell(1).value = 'Units'
      hdrRow.getCell(2).value = 'Product'
      hdrRow.getCell(3).value = 'Wholesale/Unit'
      hdrRow.getCell(4).value = 'Retail/Unit'
      hdrRow.eachCell(c => { c.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF8B0000' } }; c.border = { bottom: { style: 'thin' } } })

      let row = 8, lastGroup = null, groupSubtot = 0, grandUnits = 0

      for (const line of lines) {
        const grp = line.prod_group || ''
        if (lastGroup !== null && grp !== lastGroup) {
          const sr = ws.getRow(row)
          sr.getCell(1).value = groupSubtot
          sr.getCell(1).font = { name: 'Arial', size: 8, bold: true, italic: true }
          sr.getCell(1).alignment = { horizontal: 'right' }
          sr.getCell(2).value = `  ── ${lastGroup} subtotal`
          sr.getCell(2).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF666666' } }
          row++; groupSubtot = 0
        }
        const units = (parseFloat(line.units) || 0) - (parseFloat(line.special_ords) || 0)
        const dr = ws.getRow(row)
        dr.getCell(1).value = units
        dr.getCell(2).value = line.prod_name
        dr.getCell(3).value = parseFloat(line.wprice) || 0
        dr.getCell(4).value = parseFloat(line.rprice) || 0
        dr.getCell(3).numFmt = '$#,##0.00'; dr.getCell(4).numFmt = '$#,##0.00'
        dr.eachCell({ includeEmpty: false }, c => { c.font = hdrFont })
        groupSubtot += units; grandUnits += units; lastGroup = grp; row++
      }
      if (lastGroup !== null) {
        const sr = ws.getRow(row)
        sr.getCell(1).value = groupSubtot
        sr.getCell(1).font = { name: 'Arial', size: 8, bold: true, italic: true }
        sr.getCell(2).value = `  ── ${lastGroup} subtotal`
        sr.getCell(2).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF666666' } }
        row++
      }
      row++
      const tr = ws.getRow(row)
      tr.getCell(1).value = `Total   #${grandUnits}`
      tr.eachCell({ includeEmpty: false }, c => { c.font = { name: 'Arial', size: 10, bold: true } })
      tr.getCell(1).border = { top: { style: 'thin' } }
    }

    const filename = `packing_${del_date}${acctFilter ? '_' + acctFilter.replace(/\s+/g, '_') : ''}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('packing export error:', e)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// Lead sheets export — accounts grouped by route (driver summary list)
app.get('/api/billing/export/lead', requireAuth, async (req, res) => {
  const { del_date } = req.query
  if (!del_date) return res.status(400).json({ error: 'del_date required' })
  try {
    const ExcelJS = (await import('exceljs')).default

    const { rows: sRows } = await query(`SELECT setting, value FROM settings WHERE setting IN ('bakery_name')`)
    const settings = Object.fromEntries(sRows.map(r => [r.setting, r.value]))
    const bakeryName = settings.bakery_name || "Meredith's Country Bakery"

    // Accounts with orders on this date, ordered by route then sequence
    const { rows: accounts } = await query(`
      SELECT DISTINCT TRIM(o.account) AS account,
             COALESCE(a.route, 'No Route') AS route,
             COALESCE(a.sequence, 9999) AS sequence
      FROM daily_orders o
      LEFT JOIN accounts a ON TRIM(a.name) = TRIM(o.account)
      WHERE (o.del_date = $1 OR o.ordr_dt = $1) AND o.units > 0
      ORDER BY COALESCE(a.route, 'No Route'), COALESCE(a.sequence, 9999), TRIM(o.account)
    `, [del_date])

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bakery Manager'
    const ws = wb.addWorksheet('Lead Sheet')
    ws.getColumn(1).width = 40

    // Header
    ws.getCell('A1').value = `${bakeryName} — Lead Sheet`
    ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true }
    ws.getCell('A2').value = `Delivery Date: ${del_date}`
    ws.getCell('A2').font = { name: 'Arial', size: 10 }

    let row = 4
    let lastRoute = null

    for (const acct of accounts) {
      if (acct.route !== lastRoute) {
        if (lastRoute !== null) row++ // blank line between routes
        const rr = ws.getRow(row)
        rr.getCell(1).value = `Route: ${acct.route}`
        rr.getCell(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF8B0000' } }
        rr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } }
        ws.getRow(row).height = 28
        row++
        // underline separator
        ws.getRow(row).getCell(1).border = { bottom: { style: 'medium' } }
        row++
        lastRoute = acct.route
      }
      const ar = ws.getRow(row)
      ar.getCell(1).value = acct.account
      ar.getCell(1).font = { name: 'Arial', size: 14, bold: true }
      ws.getRow(row).height = 24
      row++
    }

    const filename = `lead_sheet_${del_date}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('lead sheet export error:', e)
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
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
  spec_orders:    [`SELECT order_num,account,location,ordr_dt,del_date,prod_name,units,price,phone,notes FROM spec_orders ORDER BY ordr_dt,account`,
                   ['order_num','account','location','ordr_dt','del_date','prod_name','units','price','phone','notes']],
  track_tix:      [`SELECT t.id,t.tix_date,t.account,t.total,t.paid,(t.total-t.paid) AS outstanding,t.notes,t.last_update
                   FROM track_tix t ORDER BY t.tix_date DESC, t.account`,
                   ['id','tix_date','account','total','paid','outstanding','notes','last_update']],
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

// Parse a CSV string into an array of objects (header row → keys)
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  function parseLine(line) {
    const fields = []; let inQuote = false, field = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQuote && line[i+1] === '"') { field += '"'; i++ } else inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { fields.push(field); field = '' }
      else field += ch
    }
    fields.push(field)
    return fields
  }
  const headers = parseLine(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
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
  let rows
  const ct = req.headers['content-type'] || ''
  if (ct.includes('text/csv')) {
    rows = typeof req.body === 'string' ? parseCSV(req.body) : []
  } else {
    rows = req.body?.rows
  }
  if (!Array.isArray(rows) || !rows.length) return res.json({ imported: 0, errors: [] })

  // Fast bulk path for large tables
  if (req.params.table === 'track_tix') {
    try {
      const norm = rows.map(r =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v?.toString().trim() ?? '']))
      )
      // Bulk create missing account stubs (inactive so they don't inflate the active count)
      const uniqueAccts = [...new Set(norm.map(r => col(r,'account')).filter(Boolean))]
      if (uniqueAccts.length) {
        const placeholders = uniqueAccts.map((_, i) => `($${i + 1}, false)`).join(',')
        await query(`INSERT INTO accounts(name,active) VALUES ${placeholders} ON CONFLICT DO NOTHING`, uniqueAccts)
      }
      // Deduplicate by (tix_date, account) — keep last occurrence
      const dedupMap = new Map()
      norm.forEach(r => {
        const d = parseAccessDate(col(r,'date') || col(r,'tix_date'))
        const a = col(r,'account')
        if (d && a) dedupMap.set(`${d}|${a}`, r)
      })
      const deduped = [...dedupMap.values()]

      // Bulk upsert in chunks of 500
      const CHUNK = 500
      let imported = 0
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const chunk = deduped.slice(i, i + CHUNK)
        if (!chunk.length) continue
        const vals = []
        const placeholders = chunk.map(r => {
          const base = vals.length
          const tdate = parseAccessDate(col(r,'date') || col(r,'tix_date'))
          const lupdt = parseAccessDate(col(r,'last_update')) || new Date().toISOString().slice(0,10)
          vals.push(tdate, col(r,'account'), num(r,'total'), num(r,'paid'), lupdt)
          return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`
        }).join(',')
        const { rowCount } = await query(`
          INSERT INTO track_tix(tix_date,account,total,paid,last_update) VALUES ${placeholders}
          ON CONFLICT(tix_date,account) DO UPDATE SET
            total=EXCLUDED.total, paid=EXCLUDED.paid, last_update=EXCLUDED.last_update
        `, vals)
        imported += rowCount
      }
      return res.json({ imported, errors: [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // Fast bulk path for spec_orders
  if (req.params.table === 'spec_orders') {
    try {
      const norm = rows.map(r =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v?.toString().trim() ?? '']))
      )
      // Filter to valid rows only
      const valid = norm.map(r => {
        const sacc  = col(r,'account') || col(r,'cust')
        const sprod = col(r,'prod_name')
        const sdate = parseAccessDate(col(r,'ordr_dt'))
        if (!sacc || !sprod || !sdate) return null
        return { sacc, sprod, sdate,
          sonum:    col(r,'order_num'),
          location: col(r,'location'),
          del_date: parseAccessDate(col(r,'del_date')),
          units:    num(r,'units'),
          price:    num(r,'price'),
          phone:    col(r,'phone'),
          notes:    col(r,'notes'),
        }
      }).filter(Boolean)

      if (!valid.length) return res.json({ imported: 0, errors: [{ error: 'No valid rows (missing account, prod_name, or ordr_dt)', row: {} }] })

      // Bulk-create missing account and product stubs (inactive so they don't inflate the active count)
      const uniqueAccts = [...new Set(valid.map(r => r.sacc))]
      const uniqueProds = [...new Set(valid.map(r => r.sprod))]
      if (uniqueAccts.length) {
        const ph = uniqueAccts.map((_, i) => `($${i+1},false)`).join(',')
        await query(`INSERT INTO accounts(name,active) VALUES ${ph} ON CONFLICT DO NOTHING`, uniqueAccts)
      }
      if (uniqueProds.length) {
        const ph = uniqueProds.map((_, i) => `($${i+1},true)`).join(',')
        await query(`INSERT INTO products(prod_name,active) VALUES ${ph} ON CONFLICT DO NOTHING`, uniqueProds)
        await query(`INSERT INTO inventory(prod_name) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`, [uniqueProds])
      }

      // Bulk insert in chunks of 500
      const CHUNK = 500
      let imported = 0
      for (let i = 0; i < valid.length; i += CHUNK) {
        const chunk = valid.slice(i, i + CHUNK)
        const vals = []
        const ph = chunk.map(r => {
          const base = vals.length
          vals.push(r.sonum ? parseInt(r.sonum) : null, r.sacc, r.location, r.sdate,
                    r.del_date, r.sprod, r.units, r.price, r.phone, r.notes)
          return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},NOW())`
        }).join(',')
        const { rowCount } = await query(`
          INSERT INTO spec_orders(order_num,account,location,ordr_dt,del_date,prod_name,units,price,phone,notes,last_update)
          VALUES ${ph} ON CONFLICT DO NOTHING
        `, vals)
        imported += rowCount
      }
      return res.json({ imported, errors: [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

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
          case 'spec_orders': {
            const sacc  = col(row,'account') || col(row,'cust')
            const sprod = col(row,'prod_name')
            const sdate = parseAccessDate(col(row,'ordr_dt'))
            if (!sacc || !sprod || !sdate) break
            const sonum = col(row,'order_num')
            await client.query(`INSERT INTO accounts(name,active) VALUES($1,false) ON CONFLICT DO NOTHING`, [sacc])
            await client.query(`INSERT INTO products(prod_name,active) VALUES($1,true) ON CONFLICT DO NOTHING`, [sprod])
            await client.query(`INSERT INTO inventory(prod_name) VALUES($1) ON CONFLICT DO NOTHING`, [sprod])
            await client.query(`
              INSERT INTO spec_orders(order_num,account,location,ordr_dt,del_date,prod_name,units,price,phone,notes,last_update)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
              ON CONFLICT DO NOTHING`,
              [sonum ? parseInt(sonum) : null, sacc, col(row,'location'), sdate,
               parseAccessDate(col(row,'del_date')),
               sprod, num(row,'units'), num(row,'price'),
               col(row,'phone'), col(row,'notes')]
            )
            break
          }
          case 'track_tix': {
            const tacc  = col(row,'account')
            const tdate = parseAccessDate(col(row,'date') || col(row,'tix_date'))
            if (!tacc || !tdate) break
            // Auto-create account stub if needed (inactive to avoid inflating active count)
            await client.query(`INSERT INTO accounts(name,active) VALUES($1,false) ON CONFLICT DO NOTHING`, [tacc])
            await client.query(`
              INSERT INTO track_tix(tix_date,account,total,paid,last_update)
              VALUES($1,$2,$3,$4,$5)
              ON CONFLICT(tix_date,account) DO UPDATE SET
                total=EXCLUDED.total, paid=EXCLUDED.paid, last_update=EXCLUDED.last_update`,
              [tdate, tacc,
               num(row,'total'), num(row,'paid'),
               parseAccessDate(col(row,'last_update')) || new Date().toISOString().slice(0,10)]
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
            await client.query(`INSERT INTO accounts(name,active) VALUES($1,false) ON CONFLICT DO NOTHING`, [aname])
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

// ─── Activity Log ──────────────────────────────────────────────────────────

app.get('/api/activity-log', requireAuth, async (req, res) => {
  const { limit = 200, username, action } = req.query
  const conds = [], vals = []
  if (username) { vals.push(username); conds.push(`username = $${vals.length}`) }
  if (action)   { vals.push(`%${action}%`); conds.push(`action ILIKE $${vals.length}`) }
  vals.push(Math.min(parseInt(limit) || 200, 1000))
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT * FROM activity_log ${where} ORDER BY created_at DESC LIMIT $${vals.length}`,
    vals
  )
  res.json(rows)
})

// ─── Access Database ───────────────────────────────────────────────────────

// GET /api/access/info?path=... — check file exists and list importable tables
app.get('/api/access/info', requireAuth, async (req, res) => {
  const filePath = req.query.path
  if (!filePath) return res.status(400).json({ error: 'path query param required' })
  try {
    const db     = await openMDB(filePath)     // throws if file not found
    const tables = getTableInfo(db)
    res.json({ ok: true, tableCount: db.getTableNames().length, tables })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// POST /api/access/import/:table?path=... — import one table (local server only)
app.post('/api/access/import/:table', requireAuth, async (req, res) => {
  const { table } = req.params
  const filePath  = req.query.path
  if (!filePath) return res.status(400).json({ error: 'path query param required' })
  const importer  = IMPORTERS[table]
  if (!importer)  return res.status(400).json({ error: `Unknown table: ${table}` })
  try {
    const db  = await openMDB(filePath)
    const tbl = makeTableGetter(db)
    const n   = await importer(tbl, query)
    await logActivity(req, 'access_import', `Imported ${n} rows into ${table} from ${filePath}`)
    res.json({ imported: n, table })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/access/import-rows/:table — browser sends raw MDB rows as CSV; server transforms + inserts
// The CSV uses original MDB column names so the server importers can apply their own field mapping.
app.post('/api/access/import-rows/:table', requireAuth, async (req, res) => {
  const { table } = req.params
  const importer  = IMPORTERS[table]
  if (!importer) return res.status(400).json({ error: `Unknown table: ${table}` })
  const ct = req.headers['content-type'] || ''
  if (!ct.includes('text/csv')) return res.status(400).json({ error: 'Expected text/csv body' })
  try {
    const rows = parseCSV(req.body)
    // Fake tbl() — returns the provided rows regardless of which MDB table name is requested
    const fakeTbl = () => rows
    const n = await importer(fakeTbl, query)
    await logActivity(req, 'access_import_browser', `Browser-imported ${n} rows into ${table}`)
    res.json({ imported: n, table })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Error handler — always return JSON, never HTML ────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

// ─── Frontend (production) ─────────────────────────────────────────────────

app.use(express.static(join(__dirname, '../dist')))
app.get('*', (_req, res) => res.sendFile(join(__dirname, '../dist/index.html')))

// ─── Start ─────────────────────────────────────────────────────────────────

pool.query('ALTER TABLE spec_orders ADD COLUMN IF NOT EXISTS cust_name text').catch(console.error)

app.listen(PORT, () => {
  console.log(`Bakery server running on port ${PORT}`)
})
