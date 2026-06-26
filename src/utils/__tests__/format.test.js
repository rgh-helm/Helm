import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatPercent,
  currentMonthKey,
  previousMonthKey,
  shiftMonthKey,
  deepClone,
  formatMonthLabel,
  formatMonthLong,
} from '../format.js'

describe('formatCurrency', () => {
  it('formats a positive integer as USD with no cents', () => {
    expect(formatCurrency(1234)).toMatch(/\$1,234/)
  })

  it('formats zero as $0', () => {
    expect(formatCurrency(0)).toMatch(/\$0/)
  })

  it('treats non-numeric input as 0', () => {
    expect(formatCurrency(undefined)).toMatch(/\$0/)
    expect(formatCurrency(null)).toMatch(/\$0/)
    expect(formatCurrency('abc')).toMatch(/\$0/)
  })

  it('formats string numbers', () => {
    expect(formatCurrency('5000')).toMatch(/\$5,000/)
  })
})

describe('formatPercent', () => {
  it('formats a number to one decimal place with a % sign', () => {
    expect(formatPercent(12.5)).toBe('12.5%')
  })

  it('respects the digits parameter', () => {
    expect(formatPercent(12.5, 0)).toBe('13%')
    expect(formatPercent(12.5, 2)).toBe('12.50%')
  })

  it('treats non-numeric as 0', () => {
    expect(formatPercent(undefined)).toBe('0.0%')
  })
})

describe('currentMonthKey', () => {
  it('returns a YYYY-MM formatted string', () => {
    const key = currentMonthKey()
    expect(key).toMatch(/^\d{4}-\d{2}$/)
  })

  it('matches the actual current year and month', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    expect(currentMonthKey()).toBe(expected)
  })
})

describe('previousMonthKey', () => {
  it('returns a YYYY-MM formatted string', () => {
    expect(previousMonthKey()).toMatch(/^\d{4}-\d{2}$/)
  })

  it('is exactly one month before currentMonthKey', () => {
    const curr = currentMonthKey()
    const prev = previousMonthKey()
    const shifted = shiftMonthKey(prev, 1)
    expect(shifted).toBe(curr)
  })
})

describe('shiftMonthKey', () => {
  it('shifts forward by positive delta', () => {
    expect(shiftMonthKey('2026-01', 1)).toBe('2026-02')
    expect(shiftMonthKey('2026-01', 12)).toBe('2027-01')
  })

  it('shifts backward by negative delta', () => {
    expect(shiftMonthKey('2026-03', -1)).toBe('2026-02')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
  })

  it('rolls over correctly at year boundaries', () => {
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01')
    expect(shiftMonthKey('2026-01', -12)).toBe('2025-01')
  })

  it('returns the same key for delta 0', () => {
    expect(shiftMonthKey('2026-06', 0)).toBe('2026-06')
  })

  it('handles end-of-month months without rollover artifacts', () => {
    // Jan → Feb should not roll to March even in a leap-year context
    expect(shiftMonthKey('2025-01', 1)).toBe('2025-02')
  })
})

describe('deepClone', () => {
  it('returns a structurally equal but distinct object', () => {
    const original = { a: 1, b: { c: [2, 3] } }
    const clone = deepClone(original)
    expect(clone).toEqual(original)
    expect(clone).not.toBe(original)
    expect(clone.b).not.toBe(original.b)
  })

  it('clones arrays', () => {
    const arr = [1, 2, { x: 3 }]
    const clone = deepClone(arr)
    expect(clone).toEqual(arr)
    expect(clone).not.toBe(arr)
  })

  it('mutations to clone do not affect original', () => {
    const original = { x: [1, 2, 3] }
    const clone = deepClone(original)
    clone.x.push(4)
    expect(original.x).toHaveLength(3)
  })
})

describe('formatMonthLabel', () => {
  it('converts YYYY-MM to a short month+year string', () => {
    // Locale-independent check: just make sure it contains the 4-digit year
    expect(formatMonthLabel('2026-07')).toMatch(/2026/)
  })

  it('returns the raw key for an empty/invalid input', () => {
    expect(formatMonthLabel('')).toBe('')
    expect(formatMonthLabel(null)).toBe('')
  })
})

describe('formatMonthLong', () => {
  it('returns a string containing the full year', () => {
    expect(formatMonthLong('2025-12')).toMatch(/2025/)
  })

  it('returns empty string for null/empty', () => {
    expect(formatMonthLong(null)).toBe('')
    expect(formatMonthLong('')).toBe('')
  })
})