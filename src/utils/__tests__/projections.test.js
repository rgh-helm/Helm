import { describe, it, expect } from 'vitest'
import { futureValue, monthsToReachTarget, requiredMonthlyContribution } from '../projections.js'

// ──────────────────────────────────────────────────────────────────────
// futureValue
// ──────────────────────────────────────────────────────────────────────

describe('futureValue', () => {
  it('returns presentValue + contributions when rate is 0', () => {
    const fv = futureValue({ presentValue: 1000, monthlyContribution: 100, annualReturnPercent: 0, months: 12 })
    expect(fv).toBeCloseTo(2200, 2) // 1000 + 100×12
  })

  it('grows correctly at a known rate', () => {
    // $0 start, $1000/mo at 6% APR for 12 months ≈ $12,336 (standard FV of annuity)
    const fv = futureValue({ presentValue: 0, monthlyContribution: 1000, annualReturnPercent: 6, months: 12 })
    expect(fv).toBeGreaterThan(12000)
    expect(fv).toBeLessThan(13000)
  })

  it('a non-zero starting balance grows on its own with no contributions', () => {
    // $10,000 at 12% APR (1%/mo) for 12 months ≈ $11,268
    const fv = futureValue({ presentValue: 10000, monthlyContribution: 0, annualReturnPercent: 12, months: 12 })
    expect(fv).toBeCloseTo(10000 * Math.pow(1.01, 12), 2)
  })

  it('returns presentValue immediately for 0 months', () => {
    const fv = futureValue({ presentValue: 5000, monthlyContribution: 200, annualReturnPercent: 6, months: 0 })
    // 0 months: growthOfPrincipal = 5000*(1+r)^0 = 5000, growthOfContributions = 0
    expect(fv).toBeCloseTo(5000, 2)
  })

  it('handles undefined rate as 0%', () => {
    const fv = futureValue({ presentValue: 1000, monthlyContribution: 100, annualReturnPercent: undefined, months: 5 })
    expect(fv).toBeCloseTo(1500, 2)
  })
})

// ──────────────────────────────────────────────────────────────────────
// monthsToReachTarget
// ──────────────────────────────────────────────────────────────────────

describe('monthsToReachTarget', () => {
  it('returns 0 when presentValue already meets or exceeds target', () => {
    expect(monthsToReachTarget({ presentValue: 10000, targetValue: 10000, monthlyContribution: 0, annualReturnPercent: 0 })).toBe(0)
    expect(monthsToReachTarget({ presentValue: 15000, targetValue: 10000, monthlyContribution: 0, annualReturnPercent: 0 })).toBe(0)
  })

  it('returns null when there is no path to the target (no contribution, no growth)', () => {
    expect(monthsToReachTarget({ presentValue: 0, targetValue: 1000, monthlyContribution: 0, annualReturnPercent: 0 })).toBeNull()
  })

  it('returns the correct number of months at 0% rate with fixed contribution', () => {
    // $0 → $1,200 at $100/mo, 0% return = exactly 12 months
    expect(monthsToReachTarget({ presentValue: 0, targetValue: 1200, monthlyContribution: 100, annualReturnPercent: 0 })).toBe(12)
  })

  it('reaches target faster with a higher monthly contribution', () => {
    const slow = monthsToReachTarget({ presentValue: 0, targetValue: 24000, monthlyContribution: 500, annualReturnPercent: 4 })
    const fast = monthsToReachTarget({ presentValue: 0, targetValue: 24000, monthlyContribution: 1000, annualReturnPercent: 4 })
    expect(fast).toBeLessThan(slow)
  })

  it('reaches target faster with a higher return rate', () => {
    const low = monthsToReachTarget({ presentValue: 0, targetValue: 20000, monthlyContribution: 500, annualReturnPercent: 0 })
    const high = monthsToReachTarget({ presentValue: 0, targetValue: 20000, monthlyContribution: 500, annualReturnPercent: 6 })
    expect(high).toBeLessThan(low)
  })

  it('returns a positive integer', () => {
    const months = monthsToReachTarget({ presentValue: 1000, targetValue: 5000, monthlyContribution: 200, annualReturnPercent: 5 })
    expect(Number.isInteger(months)).toBe(true)
    expect(months).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// requiredMonthlyContribution
// ──────────────────────────────────────────────────────────────────────

describe('requiredMonthlyContribution', () => {
  it('returns Infinity when months is 0 and there is a gap to close', () => {
    const rmc = requiredMonthlyContribution({ presentValue: 0, targetValue: 10000, months: 0, annualReturnPercent: 5 })
    expect(rmc).toBe(Infinity)
  })

  it('returns 0 when presentValue already meets target', () => {
    const rmc = requiredMonthlyContribution({ presentValue: 10000, targetValue: 5000, months: 12, annualReturnPercent: 5 })
    expect(rmc).toBe(0)
  })

  it('returns target/months at 0% rate (simple division)', () => {
    // $0 → $1,200 in 12 months at 0% = exactly $100/mo
    const rmc = requiredMonthlyContribution({ presentValue: 0, targetValue: 1200, months: 12, annualReturnPercent: 0 })
    expect(rmc).toBeCloseTo(100, 2)
  })

  it('requires less monthly contribution at a higher return rate (interest does some of the work)', () => {
    const args = { presentValue: 0, targetValue: 30000, months: 36 }
    const low = requiredMonthlyContribution({ ...args, annualReturnPercent: 0 })
    const high = requiredMonthlyContribution({ ...args, annualReturnPercent: 6 })
    expect(high).toBeLessThan(low)
  })

  it('is consistent with futureValue: plugging the result back in reaches the target', () => {
    const args = { presentValue: 2000, targetValue: 20000, months: 36, annualReturnPercent: 5 }
    const monthly = requiredMonthlyContribution(args)
    const fv = futureValue({
      presentValue: args.presentValue,
      monthlyContribution: monthly,
      annualReturnPercent: args.annualReturnPercent,
      months: args.months,
    })
    expect(fv).toBeCloseTo(args.targetValue, 0)
  })
})