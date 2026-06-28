import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deepClone } from '../utils/format'

export const DEFAULT_TRAILING_AVERAGE_MONTHS = 6
export const DEFAULT_THEME = 'ledger'

// All null by default — "unset," meaning the Affordability calculator
// falls back to its own hardcoded starting points (see AffordabilityView.vue)
// rather than these. Field names match the persisted settings keys 1:1
// (no renaming between storage and local state), so saveAffordabilityDefaults
// can just pass partial updates straight through.
const EMPTY_AFFORDABILITY_DEFAULTS = {
  grossMonthlyIncome: null,
  grossIncomeSources: [],  // [{label, amount}] — one per earner
  defaultMortgageRatePercent: null,
  defaultLoanTermYears: null,
  defaultPropertyTaxRatePercent: null,
  defaultAnnualInsurance: null,
  defaultMonthlyHOA: null,
  defaultOtherMonthlyDebt: null,
  defaultClosingCostsPercent: null,
  defaultPmiRatePercent: null,
}

export const useSettingsStore = defineStore('settings', () => {
  const trailingAverageMonths = ref(DEFAULT_TRAILING_AVERAGE_MONTHS)
  const theme = ref(DEFAULT_THEME)
  const affordabilityDefaults = ref({ ...EMPTY_AFFORDABILITY_DEFAULTS })
  const lowBalanceThreshold = ref(500)
  const primaryIncomeLabels = ref([])
  const excludedVariableCategories = ref(['Transfer'])
  const onboardingComplete = ref(false)
  const checklistDismissed = ref(false)
  const loaded = ref(false)

  async function loadSettings() {
    const settings = await window.api.settings.get()
    trailingAverageMonths.value = settings.trailingAverageMonths ?? DEFAULT_TRAILING_AVERAGE_MONTHS
    theme.value = settings.theme ?? DEFAULT_THEME
    lowBalanceThreshold.value = settings.lowBalanceThreshold ?? 500
    primaryIncomeLabels.value = settings.primaryIncomeLabels ?? []
    excludedVariableCategories.value = settings.excludedVariableCategories ?? ['Transfer']
    onboardingComplete.value = settings.onboardingComplete ?? false
    checklistDismissed.value = settings.checklistDismissed ?? false
    affordabilityDefaults.value = {
      grossMonthlyIncome: settings.grossMonthlyIncome ?? null,
      grossIncomeSources: Array.isArray(settings.grossIncomeSources) ? settings.grossIncomeSources : [],
      defaultMortgageRatePercent: settings.defaultMortgageRatePercent ?? null,
      defaultLoanTermYears: settings.defaultLoanTermYears ?? null,
      defaultPropertyTaxRatePercent: settings.defaultPropertyTaxRatePercent ?? null,
      defaultAnnualInsurance: settings.defaultAnnualInsurance ?? null,
      defaultMonthlyHOA: settings.defaultMonthlyHOA ?? null,
      defaultOtherMonthlyDebt: settings.defaultOtherMonthlyDebt ?? null,
      defaultClosingCostsPercent: settings.defaultClosingCostsPercent ?? null,
      defaultPmiRatePercent: settings.defaultPmiRatePercent ?? null,
    }
    loaded.value = true
  }

  async function setTrailingAverageMonths(months) {
    const n = Math.max(1, Math.round(Number(months)) || DEFAULT_TRAILING_AVERAGE_MONTHS)
    trailingAverageMonths.value = n
    await window.api.settings.save({ trailingAverageMonths: n })
  }

  async function setTheme(value) {
    theme.value = value
    await window.api.settings.save({ theme: value })
  }

  async function setLowBalanceThreshold(value) {
    const n = Math.max(0, Number(value) || 0)
    lowBalanceThreshold.value = n
    await window.api.settings.save({ lowBalanceThreshold: n })
  }

  async function setPrimaryIncomeLabels(labels) {
    primaryIncomeLabels.value = labels
    await window.api.settings.save({ primaryIncomeLabels: labels })
  }

  async function setExcludedVariableCategories(categories) {
    excludedVariableCategories.value = categories
    await window.api.settings.save({ excludedVariableCategories: categories })
  }

  async function setOnboardingComplete(value) {
    onboardingComplete.value = value
    await window.api.settings.save({ onboardingComplete: value })
  }

  async function setChecklistDismissed(value) {
    checklistDismissed.value = value
    await window.api.settings.save({ checklistDismissed: value })
  }

  async function saveAffordabilityDefaults(partial) {
    affordabilityDefaults.value = { ...affordabilityDefaults.value, ...partial }
    await window.api.settings.save(deepClone(partial))
  }

  return {
    trailingAverageMonths,
    theme,
    affordabilityDefaults,
    lowBalanceThreshold,
    primaryIncomeLabels,
    excludedVariableCategories,
    onboardingComplete,
    checklistDismissed,
    loaded,
    loadSettings,
    setTrailingAverageMonths,
    setTheme,
    setLowBalanceThreshold,
    setPrimaryIncomeLabels,
    setExcludedVariableCategories,
    setOnboardingComplete,
    setChecklistDismissed,
    saveAffordabilityDefaults,
  }
})