/**
 * Future value of a starting balance plus regular monthly contributions,
 * compounded monthly at the given annual return rate.
 */
export function futureValue({ presentValue, monthlyContribution, annualReturnPercent, months }) {
  const r = (annualReturnPercent || 0) / 100 / 12
  if (r === 0) {
    return presentValue + monthlyContribution * months
  }
  const growthOfPrincipal = presentValue * Math.pow(1 + r, months)
  const growthOfContributions = monthlyContribution * ((Math.pow(1 + r, months) - 1) / r)
  return growthOfPrincipal + growthOfContributions
}

/**
 * Number of whole months needed to reach a target balance given a fixed
 * monthly contribution and annual return. Returns null if unreachable.
 */
export function monthsToReachTarget({ presentValue, targetValue, monthlyContribution, annualReturnPercent }) {
  if (presentValue >= targetValue) return 0
  const r = (annualReturnPercent || 0) / 100 / 12

  if (monthlyContribution <= 0 && r <= 0) return null

  let balance = presentValue
  let months = 0
  const MAX_MONTHS = 1200 // 100-year safety cap
  while (balance < targetValue && months < MAX_MONTHS) {
    balance = balance * (1 + r) + monthlyContribution
    months++
  }
  return months >= MAX_MONTHS ? null : months
}

/**
 * Fixed monthly contribution required to reach a target balance by a
 * specific number of months from now.
 */
export function requiredMonthlyContribution({ presentValue, targetValue, months, annualReturnPercent }) {
  if (months <= 0) return targetValue - presentValue > 0 ? Infinity : 0
  const r = (annualReturnPercent || 0) / 100 / 12
  const remaining = targetValue - presentValue * Math.pow(1 + r, months)
  if (remaining <= 0) return 0
  if (r === 0) return remaining / months
  return remaining / ((Math.pow(1 + r, months) - 1) / r)
}

export function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function formatMonthYear(date) {
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/**
 * Build a full projection for a single goal — either a 'house' goal
 * (home price / down payment) or an 'emergency' goal (flat target amount,
 * or a target based on a number of months of average expenses).
 */
export function projectScenario(
  scenario,
  {
    currentHouseFund,
    currentEmergencyFund,
    avgMonthlySavings,
    avgMonthlyExpenses,
    houseFundRate,
    emergencyFundRate,
  }
) {
  let targetAmount
  let currentFund
  let downPaymentAmount = null
  let closingCosts = null

  if (scenario.type === 'emergency') {
    currentFund = currentEmergencyFund || 0
    if (scenario.emergencyMode === 'months') {
      targetAmount = (scenario.monthsOfExpenses || 0) * (avgMonthlyExpenses || 0)
    } else {
      targetAmount = scenario.targetAmount || 0
    }
  } else {
    downPaymentAmount = scenario.homePrice * (scenario.downPaymentPercent / 100)
    closingCosts = scenario.homePrice * ((scenario.closingCostsPercent || 0) / 100)
    targetAmount = downPaymentAmount + closingCosts
    currentFund = currentHouseFund || 0
  }

  const remaining = Math.max(targetAmount - currentFund, 0)
  const progressPercent = targetAmount > 0 ? Math.min((currentFund / targetAmount) * 100, 100) : 100

  // The growth rate is no longer typed per scenario — it's the
  // balance-weighted average of whichever fund accounts (house or
  // emergency) feed this goal, computed in financeStore. Every scenario
  // targeting the same fund type shares this one consistent assumption.
  const annualReturn = (scenario.type === 'emergency' ? emergencyFundRate : houseFundRate) || 0
  let monthsToGoal = null
  let projectedDate = null
  let effectiveMonthlyContribution = scenario.monthlyContribution
  let requiredContribution = null

  if (scenario.targetDate) {
    const months = Math.max(
      Math.round((new Date(scenario.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)),
      0
    )
    requiredContribution = requiredMonthlyContribution({
      presentValue: currentFund,
      targetValue: targetAmount,
      months,
      annualReturnPercent: annualReturn,
    })
    monthsToGoal = months
    projectedDate = new Date(scenario.targetDate)
  } else {
    effectiveMonthlyContribution = scenario.monthlyContribution ?? avgMonthlySavings ?? 0
    monthsToGoal = monthsToReachTarget({
      presentValue: currentFund,
      targetValue: targetAmount,
      monthlyContribution: effectiveMonthlyContribution,
      annualReturnPercent: annualReturn,
    })
    projectedDate = monthsToGoal != null ? addMonths(new Date(), monthsToGoal) : null
  }

  return {
    targetAmount,
    downPaymentAmount,
    closingCosts,
    currentFund,
    remaining,
    progressPercent,
    monthsToGoal,
    projectedDate,
    effectiveMonthlyContribution,
    requiredContribution,
    annualReturnPercent: annualReturn,
  }
}