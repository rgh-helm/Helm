import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useFinanceStore } from './financeStore'
import { projectScenario } from '../utils/projections'
import { deepClone } from '../utils/format'

export const useGoalsStore = defineStore('goals', () => {
  const scenarios = ref([])

  async function loadScenarios() {
    scenarios.value = await window.api.scenarios.list()
  }

  async function saveScenario(scenario) {
    await window.api.scenarios.save(deepClone(scenario))
    await loadScenarios()
  }

  async function deleteScenario(id) {
    await window.api.scenarios.delete(id)
    await loadScenarios()
  }

  // Live-recomputed projections for every scenario, driven by the current
  // house/emergency fund balances, recent average savings rate, and the
  // balance-weighted growth rate for each fund type (financeStore) —
  // scenarios no longer carry their own rate, since it's now derived from
  // the actual accounts feeding that goal.
  const projections = computed(() => {
    const finance = useFinanceStore()
    const context = {
      currentHouseFund: finance.currentHouseFund,
      currentEmergencyFund: finance.currentEmergencyFund,
      avgMonthlySavings: finance.avgMonthlySavings,
      avgMonthlyExpenses: finance.avgMonthlyExpenses,
      houseFundRate: finance.houseFundRate,
      emergencyFundRate: finance.emergencyFundRate,
    }
    return scenarios.value.map((scenario) => ({
      scenario,
      projection: projectScenario(scenario, context),
    }))
  })

  return { scenarios, loadScenarios, saveScenario, deleteScenario, projections }
})