/**
 * Standard fixed-rate mortgage payment formula (principal & interest only —
 * taxes/insurance/HOA are added separately, since they don't amortize).
 */
export function monthlyMortgagePayment({ principal, annualRatePercent, years }) {
  const r = (annualRatePercent || 0) / 100 / 12
  const n = (years || 0) * 12
  if (n <= 0 || principal <= 0) return 0
  if (r === 0) return principal / n
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
}

/**
 * Full monthly housing cost breakdown and the two standard lending ratios
 * (front-end: housing cost / gross income; back-end: housing cost + other
 * debt / gross income) for a given home price and set of assumptions.
 *
 * PMI (private mortgage insurance) is only actually charged when the down
 * payment is under 20% of the price (loan-to-value over 80%) — lenders
 * waive it above that threshold, so it's computed conditionally rather
 * than as a flat add-on, same as a real quote would show.
 */
export function calculateAffordability({
  price,
  downPayment,
  annualRatePercent,
  years,
  propertyTaxRatePercent,
  annualInsurance,
  monthlyHOA,
  pmiAnnualRatePercent,
  grossMonthlyIncome,
  otherMonthlyDebt,
  closingCostsPercent,
}) {
  const loanPrincipal = Math.max((price || 0) - (downPayment || 0), 0)
  const monthlyPI = monthlyMortgagePayment({ principal: loanPrincipal, annualRatePercent, years })
  const monthlyTax = ((price || 0) * (propertyTaxRatePercent || 0)) / 100 / 12
  const monthlyInsurance = (annualInsurance || 0) / 12
  const hoa = monthlyHOA || 0

  const downPaymentPercent = (price || 0) > 0 ? ((downPayment || 0) / price) * 100 : 0
  const pmiApplies = downPaymentPercent < 20 && loanPrincipal > 0
  const monthlyPMI = pmiApplies ? (loanPrincipal * (pmiAnnualRatePercent || 0)) / 100 / 12 : 0

  const monthlyHousingCost = monthlyPI + monthlyTax + monthlyInsurance + hoa + monthlyPMI

  const income = grossMonthlyIncome || 0
  const frontEndRatio = income > 0 ? (monthlyHousingCost / income) * 100 : null
  const backEndRatio = income > 0 ? ((monthlyHousingCost + (otherMonthlyDebt || 0)) / income) * 100 : null

  const closingCosts = ((price || 0) * (closingCostsPercent || 0)) / 100
  const cashNeeded = (downPayment || 0) + closingCosts

  return {
    loanPrincipal,
    monthlyPI,
    monthlyTax,
    monthlyInsurance,
    monthlyHOA: hoa,
    monthlyPMI,
    pmiApplies,
    monthlyHousingCost,
    frontEndRatio,
    backEndRatio,
    closingCosts,
    cashNeeded,
  }
}

/**
 * Green/yellow/red read on the two ratios against the standard 28/36 rule:
 * housing costs at or under 28% of gross income, total debt at or under
 * 36%, is the traditional conservative guideline; up to 33%/43% is the
 * more lenient band many lenders will still qualify. This is a widely-used
 * industry heuristic, not a guarantee of approval — actual qualification
 * depends on credit, lender, loan type, and specifics this doesn't know
 * about, so treat it as a starting signal, not a verdict.
 */
export function scoreAffordability({ frontEndRatio, backEndRatio }) {
  if (frontEndRatio == null || backEndRatio == null) return null
  if (frontEndRatio <= 28 && backEndRatio <= 36) return 'green'
  if (frontEndRatio <= 33 && backEndRatio <= 43) return 'yellow'
  return 'red'
}