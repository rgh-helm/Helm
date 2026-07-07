import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useIncomeOptionsStore = defineStore('incomeOptions', () => {
  const incomeOptions = ref([]) // [{ id, name }]
  const loaded = ref(false)

  async function loadIncomeOptions() {
    incomeOptions.value = await window.api.incomeOptions.list()
    loaded.value = true
  }

  // Throws (with a user-facing message) on empty/duplicate names — left
  // uncaught here so callers can surface it next to whatever form field
  // triggered it, same pattern as the other CRUD stores. Accepts an
  // optional schedule up front (e.g. from onboarding) instead of forcing
  // a separate saveSchedule call — returns the saved record so a caller
  // that needs the real id right away doesn't have to re-derive it.
  async function addIncomeOption(name, schedule = null) {
    const saved = await window.api.incomeOptions.save({ id: null, name, schedule })
    await loadIncomeOptions()
    return saved
  }

  async function renameIncomeOption(id, name) {
    const option = incomeOptions.value.find((o) => o.id === id)
    await window.api.incomeOptions.save({ id, name, schedule: option?.schedule ?? null })
    await loadIncomeOptions()
  }

  async function saveSchedule(id, schedule) {
    const option = incomeOptions.value.find((o) => o.id === id)
    if (!option) return
    await window.api.incomeOptions.save({ id, name: option.name, schedule })
    await loadIncomeOptions()
  }

  async function deleteIncomeOption(id) {
    await window.api.incomeOptions.delete(id)
    await loadIncomeOptions()
  }

  const incomeOptionNames = computed(() =>
    [...incomeOptions.value.map((o) => o.name)].sort((a, b) => a.localeCompare(b))
  )

  return {
    incomeOptions,
    loaded,
    loadIncomeOptions,
    addIncomeOption,
    renameIncomeOption,
    saveSchedule,
    deleteIncomeOption,
    incomeOptionNames,
  }
})