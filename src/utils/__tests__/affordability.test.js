import { describe, it, expect } from 'vitest'
import {
  monthlyMortgagePayment,
  calculateAffordability,
  scoreAffordability,
} from '../affordability.js'

describe('monthlyMortgagePayment', () => {
  it('returns 0 for zero principal', () => {
    expect(monthlyMortgagePayment({ principal: 0, annualRatePercent: 6, years: 30 })).toBe(0)
  })

  it('returns 0 for zero years', () => {
    expect(monthlyMortgagePayment({ principal: 200000, annualRatePercent: 6, years: 0 })).toBe(0)
  })

  it('returns principal/n for 0% interest rate (simple division)', () => {
    // $120,000 at 0% for 10 years = exactly $1,000/mo
    expect(monthlyMortgagePayment({ principal: 120000, annualRatePercent: 0, years: 10 })).toBeCloseTo(1000, 2)
  })

  it('returns the standard 30-year payment for a known loan (within $1)', () => {
    // $300,000 at 7% for 30 years ≈ $1,995.91/mo (well-known benchmark)
    const payment = monthlyMortgagePayment({ principal: 300000, annualRatePercent: 7, years: 30 })
    expect(payment).toBeCloseTo(1995.91, 0)
  })

  it('returns a higher payment for a 15-year vs 30-year loan at the same rate', () => {
    const p30 = monthlyMortgagePayment({ principal: 200000, annualRatePercent: 6, years: 30 })
    const p15 = monthlyMortgagePayment({ principal: 200000, annualRatePercent: 6, years: 15 })
    expect(p15).toBeGreaterThan(p30)
  })
})

describe('calculateAffordability', () => {
  const base = {
    price: 400000,
    downPayment: 80000,        // 20% down → no PMI
    annualRatePercent: 6.5,
    years: 30,
    propertyTaxRatePercent: 1.2,
    annualInsurance: 1200,
    monthlyHOA: 0,
    pmiAnnualRatePercent: 0.5,
    grossMonthlyIncome: 10000,
    otherMonthlyDebt: 500,
    closingCostsPercent: 3,
  }

  it('computes loanPrincipal as price minus downPayment', () => {
    const r = calculateAffordability(base)
    expect(r.loanPrincipal).toBe(320000)
  })

  it('does not apply PMI when down payment is exactly 20%', () => {
    const r = calculateAffordability(base)
    expect(r.pmiApplies).toBe(false)
    expect(r.monthlyPMI).toBe(0)
  })

  it('applies PMI when down payment is under 20%', () => {
    const r = calculateAffordability({ ...base, downPayment: 40000 }) // 10% down
    expect(r.pmiApplies).toBe(true)
    expect(r.monthlyPMI).toBeGreaterThan(0)
  })

  it('sums all components correctly in monthlyHousingCost', () => {
    const r = calculateAffordability(base)
    const expected = r.monthlyPI + r.monthlyTax + r.monthlyInsurance + r.monthlyHOA + r.monthlyPMI
    expect(r.monthlyHousingCost).toBeCloseTo(expected, 5)
  })

  it('calculates closing costs as a percentage of price', () => {
    const r = calculateAffordability(base)
    expect(r.closingCosts).toBeCloseTo(400000 * 0.03, 2)
  })

  it('sets cashNeeded to downPayment + closingCosts', () => {
    const r = calculateAffordability(base)
    expect(r.cashNeeded).toBeCloseTo(base.downPayment + r.closingCosts, 2)
  })

  it('returns null ratios when income is 0', () => {
    const r = calculateAffordability({ ...base, grossMonthlyIncome: 0 })
    expect(r.frontEndRatio).toBeNull()
    expect(r.backEndRatio).toBeNull()
  })

  it('front-end ratio = monthlyHousingCost / income × 100', () => {
    const r = calculateAffordability(base)
    expect(r.frontEndRatio).toBeCloseTo((r.monthlyHousingCost / base.grossMonthlyIncome) * 100, 3)
  })

  it('back-end ratio includes otherMonthlyDebt', () => {
    const r = calculateAffordability(base)
    const expected = ((r.monthlyHousingCost + base.otherMonthlyDebt) / base.grossMonthlyIncome) * 100
    expect(r.backEndRatio).toBeCloseTo(expected, 3)
  })
})

describe('scoreAffordability', () => {
  it('returns null when either ratio is null', () => {
    expect(scoreAffordability({ frontEndRatio: null, backEndRatio: 30 })).toBeNull()
    expect(scoreAffordability({ frontEndRatio: 25, backEndRatio: null })).toBeNull()
  })

  it('returns "green" when both ratios are within 28/36', () => {
    expect(scoreAffordability({ frontEndRatio: 25, backEndRatio: 33 })).toBe('green')
  })

  it('returns "green" at exactly the 28/36 boundary', () => {
    expect(scoreAffordability({ frontEndRatio: 28, backEndRatio: 36 })).toBe('green')
  })

  it('returns "yellow" in the 28-33 / 36-43 lenient band', () => {
    expect(scoreAffordability({ frontEndRatio: 30, backEndRatio: 40 })).toBe('yellow')
  })

  it('returns "yellow" at exactly the 33/43 boundary', () => {
    expect(scoreAffordability({ frontEndRatio: 33, backEndRatio: 43 })).toBe('yellow')
  })

  it('returns "red" when either ratio exceeds the lenient band', () => {
    expect(scoreAffordability({ frontEndRatio: 35, backEndRatio: 40 })).toBe('red')
    expect(scoreAffordability({ frontEndRatio: 28, backEndRatio: 50 })).toBe('red')
  })
})