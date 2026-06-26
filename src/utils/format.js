export function formatCurrency(value, options = {}) {
  const n = Number(value) || 0
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    ...options,
  })
}

export function formatPercent(value, digits = 1) {
  const n = Number(value) || 0
  return `${n.toFixed(digits)}%`
}

export function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// The previous calendar month's key, e.g. "2026-05" when today is in June
// 2026 — used for "last month's statement" vs. "this month so far".
// setDate(1) first avoids end-of-month rollover (e.g. March 31 minus one
// month landing on March 3 instead of February).
export function previousMonthKey() {
  const now = new Date()
  now.setDate(1)
  now.setMonth(now.getMonth() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Generalized version of the above — shifts an arbitrary "YYYY-MM" key by
// `delta` months (negative for earlier, positive for later) instead of
// always being relative to today. Used for forecasting (e.g. "what month
// comes after the one being edited") and the predicted-balance feature
// (e.g. "what month came before this one, for a month-start balance").
export function shiftMonthKey(monthKey, delta) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, 1)
  date.setMonth(date.getMonth() + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Plain JSON round-trip instead of native structuredClone(): structuredClone
// throws on Vue's reactive Proxies (e.g. nested arrays inside a ref()),
// since the browser's clone algorithm doesn't know how to handle them.
// Our data is always plain JSON-safe (strings/numbers/booleans/arrays/
// objects), so this is a safe and simple way to fully strip reactivity.
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

// "YYYY-MM" -> "Jul 2026" — a friendlier label than the raw key for
// anywhere a month is shown as prose rather than a chart axis.
export function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || !month) return monthKey || ''
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function formatMonthLong(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || !month) return monthKey || ''
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}