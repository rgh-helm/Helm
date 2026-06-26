import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([]) // [{ id, name }]
  const loaded = ref(false)

  async function loadCategories() {
    categories.value = await window.api.categories.list()
    loaded.value = true
  }

  // Throws (with a user-facing message) on empty/duplicate names — left
  // uncaught here so callers can surface it next to whatever form field
  // triggered it, same pattern as the other CRUD stores.
  async function addCategory(name) {
    await window.api.categories.save({ id: null, name })
    await loadCategories()
  }

  async function renameCategory(id, name) {
    await window.api.categories.save({ id, name })
    await loadCategories()
  }

  // Color-only update — looks up the category's current name locally so
  // the caller doesn't have to pass it, and so an in-flight rename in the
  // same form isn't clobbered by a stale name.
  async function setCategoryColor(id, color) {
    const category = categories.value.find((c) => c.id === id)
    if (!category) return
    await window.api.categories.save({ id, name: category.name, color })
    await loadCategories()
  }

  async function deleteCategory(id) {
    await window.api.categories.delete(id)
    await loadCategories()
  }

  const categoryNames = computed(() => [...categories.value.map((c) => c.name)].sort((a, b) => a.localeCompare(b)))

  return {
    categories,
    loaded,
    loadCategories,
    addCategory,
    renameCategory,
    setCategoryColor,
    deleteCategory,
    categoryNames,
  }
})