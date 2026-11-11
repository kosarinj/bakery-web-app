// Special Order accounts (accounts.is_special_order) — e.g. "Abingdon S.O.".
//
// Such an account has no regular orders of its own: its orders ARE its special
// orders. So that they show on the Orders screen and get counted on the bake
// list, Post Bake and tickets (all of which read daily_orders), each product's
// special-order total is kept on a daily_orders row, the way the old program's
// specgrid.addorder did: units and special_ords both carry it. Because
// special_ords = the special part, tickets (units - special_ords) and Repeat
// Orders (units - special_ords - postbake_adj) leave it out, exactly as before.
//
// For any other account special orders are NOT added to the regular order.
//
// This recomputes rather than applying deltas: for each (account, date) the
// special part of every row is set to the current special-order total, so it
// is safe to run any number of times and self-corrects after edits, moves and
// repeats. Anything typed on top of the special part (units - special_ords,
// e.g. a Post Bake addition) is kept.

const today = `(NOW() AT TIME ZONE 'America/New_York')::date`

const CTE = `
  keys AS (
    SELECT DISTINCT a.name AS account, k.d AS dt
    FROM unnest($1::text[], $2::date[]) AS k(acct, d)
    JOIN accounts a ON TRIM(a.name) = TRIM(k.acct) AND a.is_special_order IS TRUE
    WHERE k.d IS NOT NULL
  ),
  spec AS (
    SELECT k.account, k.dt, s.prod_name, SUM(COALESCE(s.units, 0)) AS u, MAX(s.price) AS price
    FROM keys k
    JOIN spec_orders s ON TRIM(s.account) = TRIM(k.account) AND s.ordr_dt = k.dt
    WHERE s.prod_name IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  cur AS (
    SELECT DISTINCT ON (TRIM(o.account), o.prod_name, o.ordr_dt)
           o.id, o.prod_name, k.account, k.dt,
           COALESCE(o.units, 0) AS units, COALESCE(o.special_ords, 0) AS so, COALESCE(o.postbake_adj, 0) AS pb
    FROM keys k
    JOIN daily_orders o ON TRIM(o.account) = TRIM(k.account) AND o.ordr_dt = k.dt
    ORDER BY TRIM(o.account), o.prod_name, o.ordr_dt, o.id
  )`

const JOIN_SPEC = `LEFT JOIN spec sp ON sp.account = c.account AND sp.dt = c.dt AND sp.prod_name = c.prod_name`

// pairs: [{ account, date }] — only Special Order accounts are touched.
export async function syncSpecialOrders(pool, pairs) {
  const list = (pairs || []).filter(p => p && p.account && p.date)
  if (!list.length) return { inserted: 0, updated: 0, deleted: 0 }
  const accts = list.map(p => String(p.account))
  // pg hands DATE columns back as a Date at LOCAL midnight, so read the local
  // parts — toISOString() would slip a day anywhere east of UTC.
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dates = list.map(p => (p.date instanceof Date ? ymd(p.date) : String(p.date).slice(0, 10)))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // A row that held nothing but special orders, whose special orders are gone.
    const del = await client.query(`
      WITH ${CTE}
      DELETE FROM daily_orders o USING cur c ${JOIN_SPEC}
      WHERE o.id = c.id AND c.so > 0 AND c.units = c.so AND c.pb = 0 AND COALESCE(sp.u, 0) = 0`, [accts, dates])
    const upd = await client.query(`
      WITH ${CTE}
      UPDATE daily_orders o
         SET units = c.units - c.so + COALESCE(sp.u, 0), special_ords = COALESCE(sp.u, 0), last_update = NOW()
      FROM cur c ${JOIN_SPEC}
      WHERE o.id = c.id AND c.so <> COALESCE(sp.u, 0)`, [accts, dates])
    // Products with special orders and no row yet. Prices from the account's
    // price list, as the old program did; the special order's price otherwise.
    const ins = await client.query(`
      WITH ${CTE}
      INSERT INTO daily_orders(prod_name, account, units, wprice, rprice, ordr_dt, del_date, special_ords, postbake_adj, last_update)
      SELECT sp.prod_name, sp.account, sp.u,
             COALESCE(pr.whole_price, sp.price, 0), COALESCE(pr.ret_price, sp.price, 0),
             sp.dt, sp.dt, sp.u, 0, NOW()
      FROM spec sp
      JOIN accounts a ON a.name = sp.account
      LEFT JOIN LATERAL (
        SELECT p.whole_price, p.ret_price FROM prices p
        WHERE p.prod_name = sp.prod_name AND TRIM(p.category) = TRIM(a.category) LIMIT 1
      ) pr ON true
      WHERE sp.u > 0
        AND NOT EXISTS (SELECT 1 FROM daily_orders o
                        WHERE TRIM(o.account) = TRIM(sp.account) AND o.prod_name = sp.prod_name AND o.ordr_dt = sp.dt)`,
      [accts, dates])
    await client.query('COMMIT')
    return { inserted: ins.rowCount, updated: upd.rowCount, deleted: del.rowCount }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

// Every date from `fromDate` (default: today, New York time) on, optionally
// for one account. Used for the one-time fill and when an account is marked.
export async function syncSpecialOrdersFrom(pool, { fromDate = null, account = null } = {}) {
  const { rows } = await pool.query(`
    SELECT DISTINCT TRIM(account) AS account, to_char(ordr_dt, 'YYYY-MM-DD') AS date FROM (
      SELECT account, ordr_dt FROM spec_orders  WHERE ordr_dt >= COALESCE($1::date, ${today})
      UNION
      SELECT account, ordr_dt FROM daily_orders WHERE ordr_dt >= COALESCE($1::date, ${today}) AND special_ords > 0
    ) x
    WHERE $2::text IS NULL OR TRIM(account) = TRIM($2::text)`, [fromDate, account])
  return syncSpecialOrders(pool, rows)
}

// An account un-marked as Special Order: take the special part back out of its
// orders from today on (rows that were only special orders go away).
export async function unsyncSpecialOrders(pool, account) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const del = await client.query(`
      DELETE FROM daily_orders
      WHERE TRIM(account) = TRIM($1) AND ordr_dt >= ${today}
        AND COALESCE(special_ords, 0) > 0 AND units = special_ords AND COALESCE(postbake_adj, 0) = 0`, [account])
    const upd = await client.query(`
      UPDATE daily_orders SET units = units - special_ords, special_ords = 0, last_update = NOW()
      WHERE TRIM(account) = TRIM($1) AND ordr_dt >= ${today} AND COALESCE(special_ords, 0) > 0`, [account])
    await client.query('COMMIT')
    return { deleted: del.rowCount, updated: upd.rowCount }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
