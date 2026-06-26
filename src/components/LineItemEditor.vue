<script setup>
import { computed, ref, watch } from 'vue'
import { formatCurrency, uid } from '../utils/format'

const props = defineProps({
  modelValue:       { type: Array,   default: () => [] },
  title:            { type: String,  required: true },
  placeholder:      { type: String,  default: 'e.g. Salary' },
  categories:       { type: Array,   default: null },
  labelSuggestions: { type: Array,   default: null },
  showRecurring:    { type: Boolean, default: false },
  showTransfer:     { type: Boolean, default: false },
  showDayOfMonth:   { type: Boolean, default: false },
  // Today's day (1-31) for the separator; null when not the current month
  currentDay:       { type: Number,  default: null },
  // Credit card spend for this month — shown alongside the expense total
  // so the user can see the full cash-out picture at a glance
  cardTotal:        { type: Number,  default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const datalistId      = `categories-${uid()}`
const labelDatalistId = `labels-${uid()}`

const showCategory    = computed(() => Array.isArray(props.categories))
const showLabelSuggest = computed(() => Array.isArray(props.labelSuggestions))

// ── Debounced sort ────────────────────────────────────────
// Track which day input is focused so we don't re-sort while the user
// is mid-keystroke (e.g. typing "30" would jump on "3").
const focusedDayId = ref(null)

// Committed sort order — only updates when no day input is focused.
// Uses item IDs so it survives prop array reference changes.
const sortedIds = ref(props.modelValue.map((i) => i.id))

watch(
  [() => props.modelValue, focusedDayId],
  () => {
    if (focusedDayId.value !== null) return // wait until blur
    applySort()
  },
  { deep: true }
)

function applySort() {
  // Debt-linked items (accountId set) always pin to the top in definition order.
  // Regular items sort by day of month beneath them.
  const debtItems    = props.modelValue.filter((i) => i.accountId)
  const regularItems = props.modelValue.filter((i) => !i.accountId)
  if (!props.showDayOfMonth) {
    sortedIds.value = [...debtItems, ...regularItems].map((i) => i.id)
    return
  }
  const withDay    = [...regularItems]
    .filter((i) => i.dayOfMonth != null && i.dayOfMonth >= 1)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
  const withoutDay = regularItems.filter((i) => !i.dayOfMonth)
  sortedIds.value  = [...debtItems, ...withDay, ...withoutDay].map((i) => i.id)
}

// Sorted display items — uses committed sortedIds, falls back gracefully
// if an ID is missing (e.g. item was just deleted while a day was focused)
const displayItems = computed(() => {
  if (!props.showDayOfMonth) return props.modelValue
  const idOrder = sortedIds.value
  const mapped  = idOrder.map((id) => props.modelValue.find((i) => i.id === id)).filter(Boolean)
  // Append any new items not yet in sortedIds (e.g. just added via +Add)
  const inOrder = new Set(idOrder)
  const extra   = props.modelValue.filter((i) => !inOrder.has(i.id))
  return [...mapped, ...extra]
})

// ── Today separator ───────────────────────────────────────
function needsTodaySeparator(item, idx) {
  if (!props.showDayOfMonth || !props.currentDay) return false
  const thisDay = item.dayOfMonth ?? Infinity
  const prevDay = idx > 0 ? (displayItems.value[idx - 1].dayOfMonth ?? Infinity) : -Infinity
  return thisDay >= props.currentDay && prevDay < props.currentDay
}

// ── Unscheduled totals ────────────────────────────────────
const unscheduledItems = computed(() =>
  props.showDayOfMonth ? props.modelValue.filter((i) => !i.dayOfMonth) : []
)
const unscheduledTotal = computed(() =>
  unscheduledItems.value.reduce((a, i) => a + (Number(i.amount) || 0), 0)
)
const grandTotal = computed(() =>
  props.modelValue.reduce((a, i) => a + (Number(i.amount) || 0), 0)
)

// ── Mutations ─────────────────────────────────────────────
function update(items) { emit('update:modelValue', items) }

function addItem() {
  const base = { id: uid(), label: '', amount: 0 }
  if (showCategory.value)   base.category   = ''
  if (props.showRecurring)  base.recurring  = false
  if (props.showTransfer)   base.isTransfer = false
  if (props.showDayOfMonth) base.dayOfMonth = null
  update([...props.modelValue, base])
}

function toggleRecurring(id) {
  const item = props.modelValue.find((i) => i.id === id)
  updateItem(id, 'recurring', !item?.recurring)
}

function toggleTransfer(id) {
  const item = props.modelValue.find((i) => i.id === id)
  updateItem(id, 'isTransfer', !item?.isTransfer)
}

function copyItem(id) {
  const item = props.modelValue.find((i) => i.id === id)
  if (!item) return
  update([...props.modelValue, { ...item, id: uid() }])
}

function removeItem(id) {
  update(props.modelValue.filter((i) => i.id !== id))
}

function updateItem(id, field, value) {
  update(props.modelValue.map((i) => (i.id === id ? { ...i, [field]: value } : i)))
}
</script>

<template>
  <div class="rounded-lg border border-base-300 bg-base-200">

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300 gap-3">
      <h3 class="font-display text-base font-semibold">{{ title }}</h3>
      <div class="flex items-center gap-3 shrink-0">
        <span
          v-if="showDayOfMonth && unscheduledItems.length > 0"
          class="text-xs text-base-content/40 tabular-nums"
          :title="`${unscheduledItems.length} item${unscheduledItems.length === 1 ? '' : 's'} without a day assigned`"
        >~{{ formatCurrency(unscheduledTotal) }} unscheduled</span>
        <span
          v-if="cardTotal > 0"
          class="text-xs text-base-content/50 tabular-nums font-mono"
          title="Credit card spend this month (tracked separately)"
        >+{{ formatCurrency(cardTotal) }} cards</span>
        <span class="font-mono tabular-nums text-sm text-base-content/70">{{ formatCurrency(grandTotal) }}</span>
      </div>
    </div>

    <datalist v-if="showCategory"      :id="datalistId">
      <option v-for="c in categories"        :key="c" :value="c" />
    </datalist>
    <datalist v-if="showLabelSuggest"  :id="labelDatalistId">
      <option v-for="l in labelSuggestions"  :key="l" :value="l" />
    </datalist>

    <!-- Rows -->
    <div class="divide-y divide-base-300">
      <template v-for="(item, idx) in displayItems" :key="item.id">

        <!-- Debt obligations section header (appears before the first debt item) -->
        <div
          v-if="item.accountId && (idx === 0 || !displayItems[idx - 1]?.accountId)"
          class="flex items-center justify-between px-4 py-1.5 bg-base-200/70"
        >
          <span class="text-[10px] font-semibold text-base-content/50 uppercase tracking-wide">
            Debt Obligations
          </span>
          <RouterLink to="/accounts" class="text-[10px] text-primary hover:underline">
            Edit amounts & extra payments →
          </RouterLink>
        </div>

        <!-- Today separator (only for non-debt items) -->
        <div
          v-if="!item.accountId && needsTodaySeparator(item, idx)"
          class="flex items-center gap-2 px-4 py-1 bg-base-200/40"
        >
          <div class="flex-1 h-px bg-base-300"></div>
          <span class="text-[10px] font-medium text-base-content/40 whitespace-nowrap select-none">
            today · day {{ currentDay }}
          </span>
          <div class="flex-1 h-px bg-base-300"></div>
        </div>

        <!-- Item row -->
        <div
          class="flex items-center gap-2 px-4 py-2 transition-opacity"
          :class="[
            item.accountId ? 'bg-base-200/30' : '',
            !item.accountId && showDayOfMonth && currentDay && item.dayOfMonth && item.dayOfMonth < currentDay
              ? 'opacity-50' : '',
          ]"
        >
          <!-- Inputs — flex-wrap among themselves -->
          <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              class="input input-sm input-bordered flex-1 min-w-[120px]"
              :placeholder="placeholder"
              :list="showLabelSuggest ? labelDatalistId : null"
              :value="item.label"
              @input="updateItem(item.id, 'label', $event.target.value)"
            />
            <input
              v-if="showCategory"
              type="text"
              class="input input-sm input-bordered w-28 shrink-0"
              placeholder="Category"
              :list="datalistId"
              :value="item.category"
              @input="updateItem(item.id, 'category', $event.target.value)"
            />
            <input
              type="number"
              step="0.01"
              class="input input-sm input-bordered w-28 shrink-0 font-mono tabular-nums text-right"
              :value="item.amount"
              @input="updateItem(item.id, 'amount', parseFloat($event.target.value) || 0)"
            />
            <!-- Day of month — focus/blur controls sort timing -->
            <input
              v-if="showDayOfMonth"
              type="number"
              min="1"
              max="31"
              class="input input-sm input-bordered w-16 shrink-0 font-mono tabular-nums text-center"
              :class="item.dayOfMonth
                ? 'border-primary/40'
                : 'border-dashed opacity-50 focus:opacity-100'"
              placeholder="Day"
              title="Day of month this item hits (used for cash flow timeline)"
              :value="item.dayOfMonth ?? ''"
              @focus="focusedDayId = item.id"
              @blur="focusedDayId = null"
              @input="updateItem(item.id, 'dayOfMonth', parseInt($event.target.value) || null)"
            />
          </div>

          <!-- Action buttons — never wrap, always anchored right -->
          <div class="flex items-center gap-0.5 shrink-0">

            <!-- Recurring toggle -->
            <button
              v-if="showRecurring"
              type="button"
              class="btn btn-ghost btn-xs btn-circle transition-colors"
              :class="item.recurring
                ? 'text-primary'
                : 'text-base-content/20 hover:text-base-content/50'"
              :title="item.recurring
                ? 'Recurring — pre-fills next month (click to unmark)'
                : 'Mark as recurring to pre-fill next month'"
              @click="toggleRecurring(item.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <!-- Transfer toggle -->
            <button
              v-if="showTransfer"
              type="button"
              class="btn btn-ghost btn-xs btn-circle transition-colors"
              :class="item.isTransfer
                ? 'text-warning'
                : 'text-base-content/20 hover:text-base-content/50'"
              :title="item.isTransfer
                ? 'Marked as transfer — excluded from income average (click to unmark)'
                : 'Mark as transfer to exclude from income average'"
              @click="toggleTransfer(item.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>

            <!-- Copy row (non-debt only) -->
            <button
              v-if="!item.accountId"
              type="button"
              class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-base-content/70"
              title="Duplicate this row"
              @click="copyItem(item.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>

            <!-- Accounts link (debt items only) -->
            <RouterLink
              v-if="item.accountId"
              to="/accounts"
              class="btn btn-ghost btn-xs btn-circle text-primary/50 hover:text-primary"
              title="Edit this debt in Accounts"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </RouterLink>

            <!-- Remove -->
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error"
              :title="item.accountId ? 'Remove from this month (does not change your account)' : 'Remove'"
              @click="removeItem(item.id)"
            >✕</button>

          </div>
        </div>
      </template>

      <div v-if="!modelValue.length" class="px-4 py-3 text-sm text-base-content/50">No items yet.</div>
    </div>

    <div class="px-4 py-2 border-t border-base-300">
      <button type="button" class="btn btn-ghost btn-xs" @click="addItem">+ Add line</button>
    </div>
  </div>
</template>