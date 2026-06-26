/**
 * Income scheduling utility.
 *
 * A "schedule" object lives on each income option and looks like:
 *   {
 *     type: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | null,
 *     dayOfWeek: 0-6,          // 0=Sun … 6=Sat  (weekly / biweekly)
 *     anchorDate: 'YYYY-MM-DD', // a known payday  (biweekly only)
 *     semiMonthlyDays: [1,15], // two fixed days   (semi-monthly)
 *     dayOfMonth: 1,           // fixed day        (monthly)
 *     amountPerOccurrence: 0,  // amount per paycheck
 *   }
 *
 * getScheduledOccurrences(schedule, 'YYYY-MM') → [{ dayOfMonth, amount }, …]
 * describeSchedule(schedule) → human-readable string
 */

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/** Parse 'YYYY-MM-DD' into a local-time Date, avoiding UTC-midnight timezone shifts. */
function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Returns an array of { dayOfMonth, amount } for every occurrence of the
 * given schedule within the given month (e.g. '2026-07').
 * Returns [] when no schedule is defined or required fields are missing.
 */
export function getScheduledOccurrences(schedule, monthKey) {
  if (!schedule?.type || !monthKey) return []

  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth  = new Date(year, month, 0).getDate()
  const amount       = Number(schedule.amountPerOccurrence) || 0
  const occurrences  = []

  // ── Weekly ────────────────────────────────────────────────────────────
  // Every occurrence of a given day-of-week in the month.
  if (schedule.type === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 4 // default Thursday
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month - 1, d).getDay() === targetDay) {
        occurrences.push({ dayOfMonth: d, amount })
      }
    }
    return occurrences
  }

  // ── Biweekly ──────────────────────────────────────────────────────────
  // Every other occurrence of the day-of-week, anchored to a known payday.
  if (schedule.type === 'biweekly') {
    const anchor = parseLocalDate(schedule.anchorDate)
    if (!anchor) return []

    const monthStart = new Date(year, month - 1, 1)
    const monthEnd   = new Date(year, month - 1, daysInMonth)

    // Walk from the anchor in 14-day steps to find the first payday
    // that falls on or after the month start.
    const MS_PER_DAY = 86400000
    const MS_PER_CYCLE = 14 * MS_PER_DAY

    // How many full 14-day cycles from anchor to month start?
    const diff  = monthStart - anchor
    let current = new Date(+anchor + Math.floor(diff / MS_PER_CYCLE) * MS_PER_CYCLE)
    // Step forward until we reach/pass the month start
    while (current < monthStart) current = new Date(+current + MS_PER_CYCLE)

    // Collect all paydays in this month
    while (current <= monthEnd) {
      occurrences.push({ dayOfMonth: current.getDate(), amount })
      current = new Date(+current + MS_PER_CYCLE)
    }
    return occurrences
  }

  // ── Semi-monthly ──────────────────────────────────────────────────────
  // Two fixed days per month (e.g. 1st and 15th). Days are clamped to the
  // last day of the month so February works correctly.
  if (schedule.type === 'semi-monthly') {
    const [d1, d2] = schedule.semiMonthlyDays || [1, 15]
    for (const day of [d1, d2]) {
      occurrences.push({ dayOfMonth: Math.min(Number(day) || 1, daysInMonth), amount })
    }
    return occurrences
  }

  // ── Monthly ───────────────────────────────────────────────────────────
  // A single fixed day per month, clamped to the last day of the month.
  if (schedule.type === 'monthly') {
    const day = Math.min(Number(schedule.dayOfMonth) || 1, daysInMonth)
    occurrences.push({ dayOfMonth: day, amount })
    return occurrences
  }

  return []
}

/** Returns a short human-readable description of a schedule, e.g. "Every Thursday". */
export function describeSchedule(schedule) {
  if (!schedule?.type) return ''
  const dow = DAY_NAMES[schedule.dayOfWeek ?? 4]
  if (schedule.type === 'weekly')        return `Every ${dow}`
  if (schedule.type === 'biweekly')      return `Every other ${dow}`
  if (schedule.type === 'semi-monthly') {
    const [d1, d2] = schedule.semiMonthlyDays || [1, 15]
    return `Days ${d1} & ${d2}`
  }
  if (schedule.type === 'monthly')       return `Day ${schedule.dayOfMonth || 1} monthly`
  return ''
}