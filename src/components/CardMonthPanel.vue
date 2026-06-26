<script setup>
import { computed, ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useFinanceStore } from '../stores/financeStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import { formatCurrency, uid } from '../utils/format'

// One card's entry for one specific month — either last month's closed
// statement or this month so far (still accumulating). Both share identical
// itemizing and CSV-import behavior.
const props = defineProps({
  cardId: { type: Number, required: true },
  month: { type: String, required: true },
  label: { type: String, required: true },
  // Show a "Settled on" date field — only meaningful for closed (last-month)
  // statements where the user knows when auto-pay actually cleared.
  showSettlement: { type: Boolean, default: false },
})
const emit = defineEmits(['saved'])

const cards = useCreditCardStore()
const finance = useFinanceStore()
const categoriesStore = useCategoriesStore()

const datalistId = `card-categories-${props.cardId}-${props.month}`

// Shared vocabulary across expense categories, other cards' usage, and the
// explicitly-managed list from Settings → Categories.
const categorySuggestions = computed(() => {
  const merged = new Set([
    ...finance.expenseCategories,
    ...cards.cardCategories,
    ...categoriesStore.categoryNames,
  ])
  return [...merged].sort((a, b) => a.localeCompare(b))
})

const entryAmount = ref('')
const itemized = ref(false)
const categoryLines = ref([])
const settlementDate = ref(null)
const saving = ref(false)
const importing = ref(false)
const importError = ref('')

// Pre-fill from whatever's already logged for this card+month, if
// anything — itemized if that entry has a category breakdown, simple
// total otherwise. Runs once at setup time: by the time this component
// exists, the parent view only renders cards after cards.loadAll() has
// already resolved, so balances.value is populated.
function loadExistingEntry() {
  const existing = cards.balanceRecordForCardMonth(props.cardId, props.month)
  settlementDate.value = existing?.settlementDate ?? null
  if (existing?.categories?.length) {
    itemized.value = true
    categoryLines.value = existing.categories.map((c) => ({ id: uid(), category: c.category, amount: c.amount }))
  } else {
    itemized.value = false
    entryAmount.value = existing?.amount ?? ''
  }
}
loadExistingEntry()

const categoryLinesTotal = computed(() =>
  categoryLines.value.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
)

function addCategoryLine() {
  categoryLines.value = [...categoryLines.value, { id: uid(), category: '', amount: 0 }]
}

function removeCategoryLine(id) {
  categoryLines.value = categoryLines.value.filter((c) => c.id !== id)
}

function updateCategoryLine(id, field, value) {
  categoryLines.value = categoryLines.value.map((c) => (c.id === id ? { ...c, [field]: value } : c))
}

function enableItemizing() {
  itemized.value = true
  if (!categoryLines.value.length) {
    // Carry over whatever's already in the simple total field as a
    // starting line, rather than making the user re-type the number.
    categoryLines.value = [{ id: uid(), category: '', amount: parseFloat(entryAmount.value) || 0 }]
  }
}

function disableItemizing() {
  itemized.value = false
  entryAmount.value = categoryLinesTotal.value || entryAmount.value
}

async function importCsv() {
  importError.value = ''
  importing.value = true
  try {
    const result = await window.api.csv.import()
    if (result.canceled) return
    if (!result.ok) {
      importError.value = result.error
      return
    }
    itemized.value = true
    categoryLines.value = result.categories.map((c) => ({ id: uid(), category: c.category, amount: c.amount }))
  } finally {
    importing.value = false
  }
}

async function logBalance() {
  saving.value = true
  try {
    const payload = {
      cardId: props.cardId,
      month: props.month,
      settlementDate: props.showSettlement ? (settlementDate.value || null) : undefined,
    }
    if (itemized.value) {
      payload.amount = categoryLinesTotal.value
      payload.categories = categoryLines.value
        .filter((c) => c.category.trim() || c.amount)
        .map((c) => ({ category: c.category, amount: parseFloat(c.amount) || 0 }))
    } else {
      payload.amount = parseFloat(entryAmount.value) || 0
    }
    await cards.saveBalance(payload)
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="border-t border-base-300 pt-3">
    <div class="flex items-center justify-between mb-1 gap-2 flex-wrap">
      <label class="text-xs text-base-content/60">{{ label }} ({{ month }})</label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          @click="itemized ? disableItemizing() : enableItemizing()"
        >
          {{ itemized ? 'Use simple total' : 'Split by category' }}
        </button>
      </div>
    </div>

    <div v-if="!itemized" class="flex gap-2 max-w-fit">
      <input
        type="number"
        step="0.01"
        class="input input-sm input-bordered flex-1 font-mono tabular-nums w-32"
        v-model="entryAmount"
        placeholder="0.00"
      />
      <button type="button" class="btn btn-ghost btn-sm" :disabled="importing" @click="importCsv">
        {{ importing ? 'Importing…' : 'Import CSV' }}
      </button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="logBalance">
        {{ saving ? 'Saving…' : 'Log' }}
      </button>
    </div>

    <!-- Settlement date — only for closed statements (last month panel) -->
    <div v-if="showSettlement" class="flex items-center gap-2 mt-2">
      <label class="text-[11px] text-base-content/45 whitespace-nowrap">Settled on</label>
      <input
        type="date"
        class="input input-xs input-bordered font-mono w-36"
        v-model="settlementDate"
      />
      <span class="text-[10px] text-base-content/30">actual auto-pay date</span>
    </div>

    <div v-else>
      <datalist :id="datalistId">
        <option v-for="c in categorySuggestions" :key="c" :value="c" />
      </datalist>
      <div class="space-y-1">
        <div v-for="line in categoryLines" :key="line.id" class="flex items-center gap-2">
          <input
            type="text"
            class="input input-xs input-bordered flex-1"
            placeholder="Category"
            :list="datalistId"
            :value="line.category"
            @input="updateCategoryLine(line.id, 'category', $event.target.value)"
          />
          <input
            type="number"
            step="0.01"
            class="input input-xs input-bordered w-24 font-mono tabular-nums text-right"
            :value="line.amount"
            @input="updateCategoryLine(line.id, 'amount', parseFloat($event.target.value) || 0)"
          />
          <button type="button" class="btn btn-ghost btn-xs btn-circle" @click="removeCategoryLine(line.id)">
            ✕
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between mt-2">
        <button type="button" class="btn btn-ghost btn-xs" @click="addCategoryLine">+ Add category</button>
        <span class="text-xs font-mono tabular-nums text-base-content/70">
          Total: {{ formatCurrency(categoryLinesTotal) }}
        </span>
      </div>
      <div class="flex gap-2 mt-2">
        <button type="button" class="btn btn-ghost btn-sm flex-1" :disabled="importing" @click="importCsv">
          {{ importing ? 'Importing…' : 'Import CSV' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm flex-1" :disabled="saving" @click="logBalance">
          {{ saving ? 'Saving…' : 'Log' }}
        </button>
      </div>
    </div>

    <p v-if="importError" class="text-xs text-error mt-1">{{ importError }}</p>
  </div>
</template>