import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settingsStore'
import { deepClone, previousMonthKey, currentMonthKey } from '../utils/format'

export const useCreditCardStore = defineStore('creditCards', () => {
  const cards = ref([])
  const balances = ref([])

  async function loadCards() {
    cards.value = await window.api.cards.list()
  }

  async function loadBalances() {
    balances.value = await window.api.balances.list()
  }

  async function loadAll() {
    await Promise.all([loadCards(), loadBalances()])
  }

  async function saveCard(card) {
    await window.api.cards.save(deepClone(card))
    await loadCards()
  }

  async function deleteCard(id) {
    // The main process cascades this to remove the card's balance history
    // too, so a single round trip covers both lists.
    await window.api.cards.delete(id)
    await loadAll()
  }

  // Upserts a card's balance for a given month — re-logging the same
  // card+month updates the existing entry instead of creating a duplicate.
  // (Matching/upsert logic lives in electron/store.cjs.) `categories` is
  // optional: an itemized split of this month's total, e.g.
  // [{ category: 'Groceries', amount: 300 }, { category: 'Dining', amount: 120 }].
  // When omitted, the balance is just a single uncategorized total.
  async function saveBalance({ cardId, month, amount, categories, settlementDate }) {
    await window.api.balances.save(deepClone({ cardId, month, amount, categories, settlementDate }))
    await loadBalances()
  }

  async function deleteBalance(id) {
    await window.api.balances.delete(id)
    await loadBalances()
  }

  function balancesForCard(cardId) {
    return balances.value
      .filter((b) => b.cardId === cardId)
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  function balanceForCardMonth(cardId, month) {
    return balances.value.find((b) => b.cardId === cardId && b.month === month)?.amount ?? null
  }

  // Full balance record (not just the amount) for a card+month, so the UI
  // can tell whether that month was itemized and pre-fill the breakdown
  // editor when re-opening it.
  function balanceRecordForCardMonth(cardId, month) {
    return balances.value.find((b) => b.cardId === cardId && b.month === month) ?? null
  }

  function averageForCard(cardId, trailingMonths) {
    const months = trailingMonths ?? useSettingsStore().trailingAverageMonths
    const entries = balancesForCard(cardId).slice(-months)
    if (!entries.length) return 0
    return entries.reduce((acc, b) => acc + b.amount, 0) / entries.length
  }

  // Total of all cards' balances logged for a given month — this is the
  // number that automatically rolls into that month's Expenses total.
  function totalForMonth(month) {
    return balances.value.filter((b) => b.month === month).reduce((acc, b) => acc + b.amount, 0)
  }

  // Every category ever typed into a card's monthly breakdown, across all
  // cards — used as autocomplete suggestions. Kept separate from
  // financeStore's expenseCategories (no store-to-store coupling here,
  // since financeStore already depends on this store) — components that
  // want both lists merge them themselves.
  const cardCategories = computed(() => {
    const used = new Set()
    for (const b of balances.value) {
      for (const c of b.categories || []) {
        const category = (c.category || '').trim()
        if (category) used.add(category)
      }
    }
    return [...used].sort((a, b) => a.localeCompare(b))
  })

  // Shared accumulation for both the per-card and all-cards breakdowns:
  // itemized entries get split out by their own categories; entries
  // logged as a single total (no itemized split) are bucketed as
  // "Uncategorized" so the result always accounts for full spend, not
  // just the itemized portion.
  function accumulateBreakdown(byCategory, entries) {
    for (const b of entries) {
      if (Array.isArray(b.categories) && b.categories.length) {
        for (const c of b.categories) {
          const amount = Number(c.amount) || 0
          if (!amount) continue
          const category = (c.category || '').trim() || 'Uncategorized'
          byCategory.set(category, (byCategory.get(category) || 0) + amount)
        }
      } else if (b.amount) {
        byCategory.set('Uncategorized', (byCategory.get('Uncategorized') || 0) + b.amount)
      }
    }
  }

  function sortedBreakdown(byCategory) {
    return [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  // Spend by category for one card. `month` (e.g. "2026-05") scopes it to
  // just that statement; omit it for the card's full lifetime aggregate
  // (the original behavior, still used by each card's own "View breakdown").
  function cardCategoryBreakdown(cardId, month = null) {
    const entries = month
      ? balancesForCard(cardId).filter((b) => b.month === month)
      : balancesForCard(cardId)
    const byCategory = new Map()
    accumulateBreakdown(byCategory, entries)
    return sortedBreakdown(byCategory)
  }

  // Same idea, but combined across every card — for the Credit Cards
  // page's "Categories" tab.
  function allCardsCategoryBreakdown(month = null) {
    const entries = month ? balances.value.filter((b) => b.month === month) : balances.value
    const byCategory = new Map()
    accumulateBreakdown(byCategory, entries)
    return sortedBreakdown(byCategory)
  }

  // Every distinct month that's had at least one card balance logged,
  // most recent first — powers the month-scope selector on the
  // Categories tab.
  const loggedMonths = computed(() => [...new Set(balances.value.map((b) => b.month))].sort().reverse())

  const cardsWithStats = computed(() =>
    cards.value.map((card) => {
      const currentMonth = currentMonthKey()
      const history = balancesForCard(card.id)

      // Cap to current month so a backfilled past record never masquerades
      // as the latest signal — future-dated records are excluded too.
      const cappedHistory = history.filter((b) => b.month <= currentMonth)
      const latest = cappedHistory.length ? cappedHistory[cappedHistory.length - 1] : null

      // Current month specifically — the only record that should drive
      // budget tracking, the progress bar, and the over/under badge.
      const currentRecord = cappedHistory.find((b) => b.month === currentMonth) ?? null

      return {
        card,
        history,
        // Most recently logged month (may be a past month if this month isn't logged yet)
        latestAmount: latest?.amount ?? null,
        latestMonth:  latest?.month ?? null,
        // Current month only — null if today's month hasn't been logged
        currentMonthAmount: currentRecord?.amount ?? null,
        isCurrentMonth: currentRecord !== null,
        average: averageForCard(card.id),
        // Only flag over budget when we actually have this month's data
        overBudget:
          card.targetBudget && currentRecord?.amount != null
            ? currentRecord.amount > card.targetBudget
            : false,
      }
    })
  )

  // Aggregate monthly spend across all cards, for the trend chart.
  const monthlyTotals = computed(() => {
    const months = [...new Set(balances.value.map((b) => b.month))].sort()
    return months.map((month) => ({ month, total: totalForMonth(month) }))
  })

  return {
    cards,
    balances,
    loadCards,
    loadBalances,
    loadAll,
    saveCard,
    deleteCard,
    saveBalance,
    deleteBalance,
    balancesForCard,
    balanceForCardMonth,
    balanceRecordForCardMonth,
    averageForCard,
    totalForMonth,
    cardCategories,
    cardCategoryBreakdown,
    allCardsCategoryBreakdown,
    loggedMonths,
    cardsWithStats,
    monthlyTotals,
  }
})