import { describe, it, expect } from 'vitest'
import { projectPayoff, formatMonthsDuration, formatPayoffDate } from '../debtPayoff.js'

describe('projectPayoff', () => {
  it('returns months:0 and zeroed totals for a zero balance', () => {
    const result = projectPayoff({ balance: 0, annualRatePercent: 5, monthlyPayment: 200 })
    expect(result).toEqual({ possible: true, months: 0, totalInterest: 0, totalPaid: 0 })
  })

  it('returns no-payment when payment is 0', () => {
    const result = projectPayoff({ balance: 5000, annualRatePercent: 5, monthlyPayment: 0 })
    expect(result).toEqual({ possible: false, reason: 'no-payment' })
  })

  it('returns payment-too-low when payment does not cover first month interest', () => {
    // $10,000 at 12% APR = $100/mo interest; paying $50 can never pay it off
    const result = projectPayoff({ balance: 10000, annualRatePercent: 12, monthlyPayment: 50 })
    expect(result).toEqual({ possible: false, reason: 'payment-too-low' })
  })

  it('correctly calculates payoff for a simple zero-interest debt', () => {
    // $1,200 at 0% interest, $100/mo → exactly 12 months, $0 interest
    const result = projectPayoff({ balance: 1200, annualRatePercent: 0, monthlyPayment: 100 })
    expect(result.possible).toBe(true)
    expect(result.months).toBe(12)
    expect(result.totalInterest).toBeCloseTo(0, 2)
    expect(result.totalPaid).toBeCloseTo(1200, 2)
  })

  it('correctly projects a standard interest-bearing debt', () => {
    // $5,000 at 6% APR with $200/mo — a typical mid-size debt payoff
    const result = projectPayoff({ balance: 5000, annualRatePercent: 6, monthlyPayment: 200 })
    expect(result.possible).toBe(true)
    expect(result.months).toBeGreaterThan(24)
    expect(result.months).toBeLessThan(36)
    expect(result.totalInterest).toBeGreaterThan(0)
    expect(result.totalPaid).toBeCloseTo(result.totalInterest + 5000, 1)
  })

  it('handles negative balance inputs as zero balance', () => {
    const result = projectPayoff({ balance: -500, annualRatePercent: 10, monthlyPayment: 100 })
    expect(result).toEqual({ possible: true, months: 0, totalInterest: 0, totalPaid: 0 })
  })

  it('handles non-numeric inputs gracefully', () => {
    const result = projectPayoff({ balance: '1200', annualRatePercent: '6', monthlyPayment: '200' })
    expect(result.possible).toBe(true)
    expect(result.months).toBeGreaterThan(0)
  })
})

describe('formatMonthsDuration', () => {
  it('returns empty string for null', () => {
    expect(formatMonthsDuration(null)).toBe('')
  })

  it('returns "already paid off" for 0 months', () => {
    expect(formatMonthsDuration(0)).toBe('already paid off')
  })

  it('formats months-only (under a year)', () => {
    expect(formatMonthsDuration(6)).toBe('6 mo')
  })

  it('formats years only (exact year, no remainder)', () => {
    expect(formatMonthsDuration(24)).toBe('2 yrs')
  })

  it('formats years and months', () => {
    expect(formatMonthsDuration(14)).toBe('1 yr 2 mo')
  })

  it('uses singular "yr" for exactly 1 year', () => {
    expect(formatMonthsDuration(13)).toBe('1 yr 1 mo')
    expect(formatMonthsDuration(12)).toBe('1 yr')
  })
})

describe('formatPayoffDate', () => {
  it('returns empty string for null', () => {
    expect(formatPayoffDate(null)).toBe('')
  })

  it('returns a non-empty string for 0 months (current month)', () => {
    const result = formatPayoffDate(0)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a string containing a 4-digit year for a future month', () => {
    const result = formatPayoffDate(24)
    expect(result).toMatch(/\d{4}/)
  })
})