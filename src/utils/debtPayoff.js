/**
 * Simulates a debt paid down by a fixed monthly payment against a fixed
 * annual interest rate, month by month, until it reaches zero (or a
 * generous time cap is hit). A simulation instead of the closed-form
 * payoff-term formula mostly for clarity — it's easy to follow and easy
 * to extend (e.g. a future "what if the rate changes" case) — and it
 * avoids the closed-form version's edge cases right at the boundary
 * where payment barely exceeds monthly interest.
 *
 * `monthlyPayment` should already be the combined minimum + extra
 * payment — this function doesn't know or care about that split, it
 * just pays the balance down by whatever number it's given each month.
 */
const MAX_MONTHS = 600 // 50 years — far beyond any realistic payoff plan

export function projectPayoff({ balance, annualRatePercent, monthlyPayment }) {
  const principal = Math.max(Number(balance) || 0, 0)
  const monthlyRate = (Number(annualRatePercent) || 0) / 100 / 12
  const payment = Math.max(Number(monthlyPayment) || 0, 0)

  if (principal <= 0) {
    return { possible: true, months: 0, totalInterest: 0, totalPaid: 0 }
  }
  if (payment <= 0) {
    return { possible: false, reason: 'no-payment' }
  }
  // If the payment doesn't even cover one month's interest on the full
  // balance, the balance will never shrink (it only gets worse from
  // here, since interest is highest when the balance is highest) — no
  // point simulating up to the time cap just to find that out.
  if (monthlyRate > 0 && payment <= principal * monthlyRate) {
    return { possible: false, reason: 'payment-too-low' }
  }

  let remaining = principal
  let totalInterest = 0
  let months = 0
  while (remaining > 0 && months < MAX_MONTHS) {
    const interest = remaining * monthlyRate
    totalInterest += interest
    remaining = remaining + interest - payment
    months += 1
    if (remaining < 0) remaining = 0
  }

  if (remaining > 0) {
    // Shouldn't normally happen given the payment-too-low check above
    // (once payment clears that bar, the margin only grows as the
    // balance drops) — kept as a safety fallback for extreme inputs.
    return { possible: false, reason: 'too-long' }
  }

  return { possible: true, months, totalInterest, totalPaid: principal + totalInterest }
}

/**
 * "X yrs Y mo" / "Y mo" — a friendlier readout than a raw month count.
 */
export function formatMonthsDuration(months) {
  if (months == null) return ''
  if (months === 0) return 'already paid off'
  const years = Math.floor(months / 12)
  const remainder = months % 12
  const parts = []
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`)
  if (remainder > 0 || years === 0) parts.push(`${remainder} mo`)
  return parts.join(' ')
}

/**
 * The calendar month/year a payoff lands in, given a month count from
 * today — e.g. "Mar 2031". Used alongside formatMonthsDuration so a
 * payoff projection reads as both "how long" and "by when."
 */
export function formatPayoffDate(months) {
  if (months == null) return ''
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}