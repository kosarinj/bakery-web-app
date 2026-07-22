// Effective baking date for the app.
//
// `baking_date` is a single persisted setting. In the old VB program the baking
// date was re-prompted each session and defaulted forward, so it never went
// stale. Here it's stored once and edited manually from Settings, which means a
// frozen value would silently drive every date-scoped page (Bake Schedule,
// Orders, Special Orders, Billing, Recipes, Dashboard) to an old day.
//
// To keep it dynamic: honor the stored value only when it's today or later
// (so a future date can still be pinned in Settings), and otherwise fall back
// to today. A blank/undefined setting also falls back to today.

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function effectiveBakingDate(stored) {
  const today = todayStr()
  const s = (stored || '').slice(0, 10)
  // Use the stored date only if it parses as YYYY-MM-DD and is not in the past.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today) return s
  return today
}
