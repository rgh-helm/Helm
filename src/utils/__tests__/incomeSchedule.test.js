import { describe, it, expect } from 'vitest'
import { getScheduledOccurrences, describeSchedule } from '../incomeSchedule.js'

// ──────────────────────────────────────────────────────────────────────
// getScheduledOccurrences
// ──────────────────────────────────────────────────────────────────────

describe('getScheduledOccurrences – weekly', () => {
  // July 2026 has five Thursdays (2, 9, 16, 23, 30)
  const schedule = { type: 'weekly', dayOfWeek: 4, amountPerOccurrence: 1000 }

  it('returns one entry per occurrence of the weekday in the month', () => {
    const occ = getScheduledOccurrences(schedule, '2026-07')
    expect(occ).toHaveLength(5)
    expect(occ.map(o => o.dayOfMonth)).toEqual([2, 9, 16, 23, 30])
  })

  it('attaches the correct amount to each occurrence', () => {
    const occ = getScheduledOccurrences(schedule, '2026-07')
    expect(occ.every(o => o.amount === 1000)).toBe(true)
  })

  it('returns 4 occurrences for a weekday that appears only 4 times', () => {
    // Mondays in July 2026: 6, 13, 20, 27
    const occ = getScheduledOccurrences({ type: 'weekly', dayOfWeek: 1, amountPerOccurrence: 500 }, '2026-07')
    expect(occ).toHaveLength(4)
  })
})

describe('getScheduledOccurrences – biweekly', () => {
  // Anchor on a known Thursday payday: 2026-07-02
  // Next paydays: 2026-07-16, 2026-07-30 (two in July)
  const schedule = {
    type: 'biweekly',
    dayOfWeek: 4,
    anchorDate: '2026-07-02',
    amountPerOccurrence: 1500,
  }

  it('returns every-other-week paydays within the month', () => {
    const occ = getScheduledOccurrences(schedule, '2026-07')
    expect(occ.map(o => o.dayOfMonth)).toContain(2)
    expect(occ.map(o => o.dayOfMonth)).toContain(16)
    expect(occ.map(o => o.dayOfMonth)).toContain(30)
    expect(occ).toHaveLength(3)
  })

  it('shifts correctly into a different month (August 2026 has 2 paydays: 13, 27)', () => {
    const occ = getScheduledOccurrences(schedule, '2026-08')
    expect(occ.map(o => o.dayOfMonth)).toEqual([13, 27])
  })

  it('returns [] when anchorDate is missing', () => {
    const occ = getScheduledOccurrences(
      { type: 'biweekly', dayOfWeek: 4, amountPerOccurrence: 1000 },
      '2026-07'
    )
    expect(occ).toEqual([])
  })
})

describe('getScheduledOccurrences – semi-monthly', () => {
  const schedule = { type: 'semi-monthly', semiMonthlyDays: [1, 15], amountPerOccurrence: 800 }

  it('returns exactly 2 occurrences per month', () => {
    const occ = getScheduledOccurrences(schedule, '2026-06')
    expect(occ).toHaveLength(2)
    expect(occ[0].dayOfMonth).toBe(1)
    expect(occ[1].dayOfMonth).toBe(15)
  })

  it('clamps day 31 to the last day of a short month (February)', () => {
    const occ = getScheduledOccurrences(
      { type: 'semi-monthly', semiMonthlyDays: [1, 31], amountPerOccurrence: 100 },
      '2025-02'
    )
    expect(occ[1].dayOfMonth).toBe(28) // 2025 is not a leap year
  })

  it('clamps to 29 in a leap-year February', () => {
    const occ = getScheduledOccurrences(
      { type: 'semi-monthly', semiMonthlyDays: [1, 31], amountPerOccurrence: 100 },
      '2024-02'
    )
    expect(occ[1].dayOfMonth).toBe(29)
  })
})

describe('getScheduledOccurrences – monthly', () => {
  it('returns exactly 1 occurrence on the specified day', () => {
    const occ = getScheduledOccurrences(
      { type: 'monthly', dayOfMonth: 10, amountPerOccurrence: 2000 },
      '2026-07'
    )
    expect(occ).toHaveLength(1)
    expect(occ[0].dayOfMonth).toBe(10)
    expect(occ[0].amount).toBe(2000)
  })

  it('clamps day 31 to the last day of the month', () => {
    const occ = getScheduledOccurrences(
      { type: 'monthly', dayOfMonth: 31, amountPerOccurrence: 100 },
      '2026-06'
    )
    expect(occ[0].dayOfMonth).toBe(30) // June has 30 days
  })
})

describe('getScheduledOccurrences – edge cases', () => {
  it('returns [] for null schedule', () => {
    expect(getScheduledOccurrences(null, '2026-07')).toEqual([])
  })

  it('returns [] for null monthKey', () => {
    expect(getScheduledOccurrences({ type: 'weekly', dayOfWeek: 4 }, null)).toEqual([])
  })

  it('returns [] when schedule.type is null', () => {
    expect(getScheduledOccurrences({ type: null }, '2026-07')).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────────
// describeSchedule
// ──────────────────────────────────────────────────────────────────────

describe('describeSchedule', () => {
  it('returns "" for null or missing type', () => {
    expect(describeSchedule(null)).toBe('')
    expect(describeSchedule({ type: null })).toBe('')
  })

  it('describes weekly schedules', () => {
    expect(describeSchedule({ type: 'weekly', dayOfWeek: 4 })).toBe('Every Thursday')
    expect(describeSchedule({ type: 'weekly', dayOfWeek: 1 })).toBe('Every Monday')
  })

  it('describes biweekly schedules', () => {
    expect(describeSchedule({ type: 'biweekly', dayOfWeek: 4 })).toBe('Every other Thursday')
  })

  it('describes semi-monthly schedules', () => {
    expect(describeSchedule({ type: 'semi-monthly', semiMonthlyDays: [1, 15] })).toBe('Days 1 & 15')
  })

  it('describes monthly schedules', () => {
    expect(describeSchedule({ type: 'monthly', dayOfMonth: 5 })).toBe('Day 5 monthly')
  })
})