// scenarioStore.js — persisted forecast scenarios for the sandbox
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

export const useScenarioStore = defineStore('scenarios', () => {
  const scenarios  = ref([])
  const loaded     = ref(false)
  const activeId   = ref(null) // which scenario is selected in the sandbox

  async function loadScenarios() {
    if (loaded.value) return
    scenarios.value = await window.api.scenarios.list()
    loaded.value = true
    // Auto-select first scenario if none selected
    if (!activeId.value && scenarios.value.length) {
      activeId.value = scenarios.value[0].id
    }
  }

  async function saveScenario(scenario) {
    const saved = await window.api.scenarios.save(deepClone(scenario))
    const idx = scenarios.value.findIndex((s) => s.id === saved.id)
    if (idx >= 0) scenarios.value[idx] = saved
    else {
      scenarios.value.push(saved)
      activeId.value = saved.id
    }
    return saved
  }

  async function deleteScenario(id) {
    await window.api.scenarios.delete(id)
    scenarios.value = scenarios.value.filter((s) => s.id !== id)
    if (activeId.value === id) {
      activeId.value = scenarios.value[0]?.id ?? null
    }
  }

  const activeScenario = computed(() =>
    scenarios.value.find((s) => s.id === activeId.value) ?? null
  )

  const activeAdjustments = computed(() =>
    activeScenario.value?.adjustments ?? []
  )

  // Helpers for mutating the active scenario's adjustments
  async function updateActiveAdjustments(adjustments) {
    if (!activeScenario.value) return
    await saveScenario({ ...activeScenario.value, adjustments })
  }

  async function addAdjustment(adj) {
    const existing = [...(activeScenario.value?.adjustments ?? [])]
    await updateActiveAdjustments([...existing, { ...adj, _id: Date.now() }])
  }

  async function removeAdjustment(_id) {
    const existing = activeScenario.value?.adjustments ?? []
    await updateActiveAdjustments(existing.filter((a) => a._id !== _id))
  }

  async function updateAdjustment(_id, patch) {
    const existing = activeScenario.value?.adjustments ?? []
    await updateActiveAdjustments(
      existing.map((a) => a._id === _id ? { ...a, ...patch } : a)
    )
  }

  return {
    scenarios, loaded, activeId, activeScenario, activeAdjustments,
    loadScenarios, saveScenario, deleteScenario,
    updateActiveAdjustments, addAdjustment, removeAdjustment, updateAdjustment,
  }
})