// useTimelineSimulation.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared simulation engine used by both CashFlowTimeline (reality view) and
// ScenarioSandbox (what-if view). Accepts the four stores plus an optional
// `adjustments` array that the sandbox uses to mutate the item list before
// simulating. The baseline timeline passes no adjustments.
//
// Adjustment types:
//   { type: 'cc_reduce_pct',    value: 20 }              // reduce ALL card auto-pays by 20%
//   { type: 'cc_reduce_card',   cardId: 3, value: 50 }   // reduce one card's auto-pay by $50
//   { type: 'transfer_savings', value: 500 }              // extra $500/mo outflow
//   { type: 'add_expense',      label, amount, dayOfMonth? }
//   { type: 'remove_expense',   label }                   // remove by label match
//   { type: 'change_income',    label, amount }           // override income item amount
//   { type: 'one_time_expense', label, amount, month }    // only in a specific month

import { shiftMonthKey } from '../utils/format'

export const UNDATED_INCOME_DEFAULT_DAY = 15
export const WHAT_IF_SHIFT = 3

// ── Card payment info ─────────────────────────────────────
// Returns { amount, day, month } for a card's auto-pay in a given month.
export function cardPaymentInfo(cardId, card, monthKey, cardsStore) {
  const prevMonth = shiftMonthKey(monthKey, -1)
  const prevRecord = cardsStore.balanceRecordForCardMonth(cardId, prevMonth)
  const amount = prevRecord?.amount
    ?? cardsStore.cardsWithStats.find(cs => cs.card.id === cardId)?.average
    ?? 0

  if (prevRecord?.settlementDate) {
    const [sYear, sMonth, sDay] = prevRecord.settlementDate.split('-').map(Number)
    const settlementMonthKey = `${sYear}-${String(sMonth).padStart(2, '0')}`
    return { amount, day: sDay, month: settlementMonthKey }
  }

  const dueDay = card.statementDueDay
  if (dueDay) return { amount, day: dueDay, month: monthKey }
  return null
}

// ── Items for a given month ───────────────────────────────
export function getItemsForMonth(monthKey, { financeStore, cardsStore, adjustments = [] }) {
  let income   = []
  let expenses = []

  const snap = financeStore.sortedSnapshots.find((s) => s.month === monthKey)
  if (snap) {
    income   = (snap.incomeItems  || []).map((i) => ({ ...i, itemType: 'income'  }))
    expenses = (snap.expenseItems || []).map((i) => ({ ...i, itemType: 'expense' }))
  } else {
    const { incomeItems, expenseItems } = financeStore.recurringProjection
    income   = incomeItems .map((i) => ({ ...i, itemType: 'income'  }))
    expenses = expenseItems.map((i) => ({ ...i, itemType: 'expense' }))
  }

  // ── Card auto-pay injection ───────────────────────────────
  for (const card of cardsStore.cards) {
    if (!card.statementDueDay) continue

    const info = cardPaymentInfo(card.id, card, monthKey, cardsStore)
    if (info && info.month === monthKey && info.amount > 0) {
      expenses.push({
        id: `_card_${card.id}`, label: `${card.name} auto-pay`,
        amount: info.amount, itemType: 'expense', dayOfMonth: info.day,
      })
      continue
    }

    const prevInfo = cardPaymentInfo(card.id, card, shiftMonthKey(monthKey, -1), cardsStore)
    if (prevInfo && prevInfo.month === monthKey && prevInfo.amount > 0) {
      expenses.push({
        id: `_card_spill_${card.id}`, label: `${card.name} auto-pay`,
        amount: prevInfo.amount, itemType: 'expense', dayOfMonth: prevInfo.day,
      })
    }
  }

  // ── Apply scenario adjustments ────────────────────────────
  for (const adj of adjustments) {
    if (adj.type === 'cc_reduce_pct') {
      expenses = expenses.map((e) =>
        e.id?.startsWith('_card_')
          ? { ...e, amount: e.amount * (1 - (adj.value || 0) / 100) }
          : e
      )
    }

    else if (adj.type === 'cc_reduce_card') {
      expenses = expenses.map((e) =>
        (e.id === `_card_${adj.cardId}` || e.id === `_card_spill_${adj.cardId}`)
          ? { ...e, amount: Math.max(0, e.amount - (adj.value || 0)) }
          : e
      )
    }

    else if (adj.type === 'transfer_savings') {
      if (adj.value > 0) {
        expenses.push({
          id: '_adj_transfer_savings', label: 'Savings transfer',
          amount: adj.value, itemType: 'expense',
          dayOfMonth: adj.dayOfMonth || 28,
        })
      }
    }

    else if (adj.type === 'add_expense') {
      expenses.push({
        id: `_adj_add_${adj.label}`, label: adj.label || 'New expense',
        amount: adj.amount || 0, itemType: 'expense',
        dayOfMonth: adj.dayOfMonth || null,
      })
    }

    else if (adj.type === 'remove_expense') {
      const lc = (adj.label || '').toLowerCase()
      expenses = expenses.filter((e) => (e.label || '').toLowerCase() !== lc)
    }

    else if (adj.type === 'change_income') {
      const lc = (adj.label || '').toLowerCase()
      income = income.map((i) =>
        (i.label || '').toLowerCase() === lc
          ? { ...i, amount: adj.amount || 0 }
          : i
      )
    }

    else if (adj.type === 'one_time_expense' && adj.month === monthKey) {
      expenses.push({
        id: `_adj_onetime_${adj.label}_${monthKey}`, label: adj.label || 'One-time expense',
        amount: adj.amount || 0, itemType: 'expense',
        dayOfMonth: adj.dayOfMonth || null,
      })
    }
  }

  return [...income, ...expenses]
}

// ── Core month simulation ─────────────────────────────────
export function simulateMonth(monthKey, startBalance, rawItems, opts = {}) {
  const {
    undatedIncomeDay = UNDATED_INCOME_DEFAULT_DAY,
    incomeShift      = 0,
    expenseShift     = 0,
  } = opts

  const [y, m] = monthKey.split('-').map(Number)
  const days   = new Date(y, m, 0).getDate()

  const hasDaySet = (item) => Number.isInteger(item.dayOfMonth) && item.dayOfMonth >= 1

  const items = rawItems.map((item) => {
    if (!hasDaySet(item)) return item
    if (item.itemType === 'income'  && incomeShift)  return { ...item, dayOfMonth: Math.min(Math.max(1, item.dayOfMonth + incomeShift),  28) }
    if (item.itemType === 'expense' && expenseShift) return { ...item, dayOfMonth: Math.min(Math.max(1, item.dayOfMonth + expenseShift), days) }
    return item
  })

  const datedIncome     = items.filter((i) => i.itemType === 'income'  &&  hasDaySet(i))
  const datedExpenses   = items.filter((i) => i.itemType === 'expense' &&  hasDaySet(i))
  const undatedIncome   = items.filter((i) => i.itemType === 'income'  && !hasDaySet(i))
  const undatedExpenses = items.filter((i) => i.itemType === 'expense' && !hasDaySet(i))

  const totalUndatedIncome  = undatedIncome .reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const totalUndatedExpense = undatedExpenses.reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const dailyBurn = totalUndatedExpense / days

  let running = startBalance
  const balances = []
  const events   = []
  let lowestBalance = running
  let lowestDay     = null
  let overdraftDay  = null

  for (let day = 1; day <= days; day++) {
    const dayEvents = []

    for (const item of datedIncome) {
      if (Math.min(item.dayOfMonth, days) === day) {
        running += Number(item.amount) || 0
        dayEvents.push({ label: item.label, amount: Number(item.amount) || 0, itemType: 'income' })
      }
    }
    if (day === Math.min(undatedIncomeDay, days) && totalUndatedIncome > 0) {
      running += totalUndatedIncome
      const label = undatedIncome.length === 1
        ? undatedIncome[0].label
        : `${undatedIncome.length} income items (undated)`
      dayEvents.push({ label, amount: totalUndatedIncome, itemType: 'income', isGrouped: undatedIncome.length > 1 })
    }

    for (const item of datedExpenses) {
      if (Math.min(item.dayOfMonth, days) === day) {
        running -= Number(item.amount) || 0
        dayEvents.push({ label: item.label, amount: Number(item.amount) || 0, itemType: 'expense' })
      }
    }
    if (dailyBurn > 1) {
      running -= dailyBurn
      dayEvents.push({ label: 'Daily spend (spread)', amount: dailyBurn, itemType: 'expense', isDailyBurn: true })
    }

    const rounded = Math.round(running)
    balances.push(rounded)
    events.push(dayEvents)

    if (rounded < lowestBalance) { lowestBalance = rounded; lowestDay = day }
    if (overdraftDay === null && rounded < 0) overdraftDay = day
  }

  return {
    monthKey,
    daysInMonth: days,
    openingBalance: startBalance,
    balances,
    events,
    lowestBalance,
    lowestDay,
    overdraftDay,
    hasOverdraft:     overdraftDay !== null,
    closingBalance:   balances.at(-1) ?? startBalance,
    undatedItemCount: undatedIncome.length + undatedExpenses.length,
    datedItemCount:   datedIncome.length  + datedExpenses.length,
  }
}

// ── Multi-month chain ─────────────────────────────────────
// Runs the simulation across N months, anchoring on logged balances for
// past months and carrying simulated closing balances forward otherwise.
export function buildMonthChain({
  startMonth, rangeMonths, openingBalance, calToday,
  accountsStore, financeStore, cardsStore,
  adjustments = [],
}) {
  const sims   = []
  let balance  = openingBalance

  for (let i = 0; i < rangeMonths; i++) {
    const m = shiftMonthKey(startMonth, i)

    if (i > 0) {
      const prevMonth = shiftMonthKey(startMonth, i - 1)
      const isPastMonth = prevMonth < calToday
      if (isPastMonth) {
        const logged = accountsStore.balanceForAccountMonth(
          accountsStore.transactionAccount?.id, prevMonth
        )
        if (logged !== null) balance = logged
      }
    }

    const items = getItemsForMonth(m, { financeStore, cardsStore, adjustments })
    const sim   = simulateMonth(m, balance, items)
    sims.push(sim)
    balance = sim.closingBalance
  }

  return sims
}