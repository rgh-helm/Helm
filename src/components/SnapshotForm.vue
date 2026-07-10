<script setup>
import { computed, ref, watch } from 'vue'
import LineItemEditor from './LineItemEditor.vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { formatCurrency, deepClone, shiftMonthKey, currentMonthKey, uid } from '../utils/format'
import { formatMonthLong } from '../utils/format'
import { getScheduledOccurrences } from '../utils/incomeSchedule'
import { useIncomeOptionsStore } from '../stores/incomeOptionsStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  initial:         { type: Object,  default: null  },
  // When DataEntryView controls navigation, it passes the selected month
  // here and hides the internal picker so there's only one source of truth.
  month:           { type: String,  default: null  },
  showMonthPicker: { type: Boolean, default: true  },
})
const emit = defineEmits(['saved'])

const finance      = useFinanceStore()
const cards        = useCreditCardStore()
const accountsStore = useAccountsStore()
const incomeOptionsStore = useIncomeOptionsStore()

// Expands all scheduled income sources into dated line items for a given
// month. Each generated item is tagged with scheduleSourceId so isBlank()
// and doPrefill can identify and regenerate them rather than treating them
// as manual user entries.
function buildScheduledIncome(monthKey) {
  const items = []
  for (const option of incomeOptionsStore.incomeOptions) {
    if (!option.schedule?.type) continue
    const occurrences = getScheduledOccurrences(option.schedule, monthKey)
    for (const occ of occurrences) {
      items.push({
        id:               uid(),
        label:            option.name,
        amount:           occ.amount,
        dayOfMonth:       occ.dayOfMonth,
        scheduleSourceId: option.id,
      })
    }
  }
  return items
}

// Creates a blank form for a given month, automatically injecting any
// debt accounts as pinned expense items so the user never has to manually
// re-enter Camry, Silverado, etc. each month. Items are tagged with
// `accountId` so LineItemEditor can render them in their own section.
function createBlankForMonth(monthKey) {
  const debtItems = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0)
    .map((account) => ({
      id:          uid(),
      label:       account.name,
      amount:      (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:    'Debt',
      recurring:   true,
      dayOfMonth:  account.paymentDayOfMonth ?? null,
      accountId:   account.id,
    }))
  return {
    id:           null,
    month:        monthKey,
    incomeItems:  buildScheduledIncome(monthKey),
    expenseItems: debtItems,
    notes:        '',
  }
}

function blank() {
  return createBlankForMonth(props.month ?? currentMonthKey())
}

const form = ref(props.initial ? deepClone(props.initial) : blank())

// A local snapshot of what's actually saved for the currently-loaded
// month — the source of truth for "unsaved changes," both for the
// sticky-footer indicator and the per-row table highlighting below.
// Kept as its own ref (rather than comparing directly against
// props.initial) so it updates the instant save() succeeds, without
// waiting a tick for the parent to re-render with a fresh prop.
const savedBaseline = ref(props.initial ? deepClone(props.initial) : null)

const monthChangeStatus = ref('')

// Injects any debt accounts not already present in the form (identified
// by accountId). Safe to call on any form state — it's a no-op for
// accounts already represented. Runs on both blank and existing months
// so debt obligations always appear at the top of the expense list.
function injectMissingDebtItems() {
  const existingIds = new Set(
    form.value.expenseItems.filter((i) => i.accountId).map((i) => i.accountId)
  )
  const toInject = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0 && !existingIds.has(a.id))
    .map((account) => ({
      id:         uid(),
      label:      account.name,
      amount:     (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:   'Debt',
      recurring:  true,
      dayOfMonth: account.paymentDayOfMonth ?? null,
      accountId:  account.id,
    }))
  if (toInject.length) {
    form.value.expenseItems = [...toInject, ...form.value.expenseItems]
  }
}

// Same idea as injectMissingDebtItems, for scheduled income: fills in any
// occurrence not already present for this month (identified by
// scheduleSourceId), so a schedule that didn't exist yet when this
// month's snapshot was first created — e.g. one set up during onboarding
// before the snapshot existed, or added/edited afterward — still shows
// up without the user re-entering paychecks by hand.
function injectMissingScheduledIncome() {
  const monthKey = form.value.month
  const existingSourceIds = new Set(
    form.value.incomeItems.filter((i) => i.scheduleSourceId).map((i) => i.scheduleSourceId)
  )
  // Fallback for items that predate scheduleSourceId tracking (hand-typed,
  // backfilled, or imported before this option had a schedule) — without
  // this, an untagged "Riley Salary" row that's already sitting in the
  // month gets treated as if the schedule had never fired, and a second,
  // duplicate set of paychecks gets injected right alongside it. A label
  // match (trimmed, case-insensitive) is treated as the source already
  // being covered, same identity rule used elsewhere for label-based
  // matching. Renaming the option later intentionally stops matching its
  // older rows — same as the one-time backfill in store.cjs.
  const existingLabels = new Set(
    form.value.incomeItems
      .filter((i) => !i.scheduleSourceId)
      .map((i) => (i.label || '').trim().toLowerCase())
  )
  const toInject = []
  for (const option of incomeOptionsStore.incomeOptions) {
    if (!option.schedule?.type) continue
    if (existingSourceIds.has(option.id)) continue
    if (existingLabels.has((option.name || '').trim().toLowerCase())) continue
    for (const occ of getScheduledOccurrences(option.schedule, monthKey)) {
      toInject.push({
        id: uid(),
        label: option.name,
        amount: occ.amount,
        dayOfMonth: occ.dayOfMonth,
        scheduleSourceId: option.id,
      })
    }
  }
  if (toInject.length) {
    form.value.incomeItems = [...form.value.incomeItems, ...toInject]
  }
}

// Re-initialise whenever the parent changes target snapshot or month,
// then ensure debt items and scheduled income are present.
watch(
  [() => props.initial, () => props.month],
  ([initial]) => {
    form.value = initial ? deepClone(initial) : createBlankForMonth(props.month ?? currentMonthKey())
    savedBaseline.value = initial ? deepClone(initial) : null
    monthChangeStatus.value = ''
    injectMissingDebtItems()
    injectMissingScheduledIncome()
  }
)

// Also run when debt accounts or income schedules first load (async) or
// change — so that if a store wasn't ready when the form initialised, or
// a schedule is added/edited after the fact, items still appear without
// requiring a fresh blank month.
watch(
  () => accountsStore.debtAccounts,
  () => injectMissingDebtItems(),
  { immediate: true }
)
watch(
  () => incomeOptionsStore.incomeOptions,
  () => injectMissingScheduledIncome(),
  { immediate: true }
)

// The month field is a navigation control, not just a label — changing it
// (whether starting a fresh entry, or while editing an existing one via
// History) re-resolves against whatever's actually saved for that month,
// rather than silently keeping the previous month's form contents around.
// Without this, switching from June to May to backfill it would leave
// June's still-typed-in numbers sitting under a "May" label — and worse,
// if editing an existing record (form.id already set), saving would
// rename that record to May by id, regardless of whether a real May entry
// already existed separately.
function handleMonthChange(newMonth) {
  if (!newMonth || newMonth === form.value.month) return
  const existing = finance.snapshots.find((s) => s.month === newMonth)
  if (existing) {
    form.value = deepClone(existing)
    savedBaseline.value = deepClone(existing)
    monthChangeStatus.value = `Loaded your existing ${newMonth} entry.`
  } else {
    form.value = { ...blank(), month: newMonth }
    savedBaseline.value = null
    monthChangeStatus.value = `Starting a new, blank entry for ${newMonth}.`
  }
}

const cardSpendThisMonth = computed(() => cards.totalForMonth(form.value.month))

// Pass the current day to LineItemEditor so it can render the today
// separator and unscheduled totals — only meaningful for the current month.
const todayDay = computed(() => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return form.value.month === thisMonth ? now.getDate() : null
})

// Live totals computed from the in-progress form — update as you type
// so the predicted balance below stays current without needing a save.
const liveIncome = computed(() =>
  form.value.incomeItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
)
const liveExpenses = computed(() =>
  form.value.expenseItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0) +
  cardSpendThisMonth.value
)
const liveNetCashFlow = computed(() => liveIncome.value - liveExpenses.value)

const saving = ref(false)
const error = ref('')
const toast = useToast()

// "Unsaved" is derived by comparing the live form against savedBaseline —
// not tracked as a separately-mutated boolean. A deep watch that flips a
// flag to true on any change to form.value used to fire even for changes
// *we* made (injectMissingScheduledIncome re-running after a month
// switch, the props watcher's own reassignment, etc.), not just real user
// edits — which is why switching months could land on "Unsaved changes"
// for a month nobody had touched, and "saving" it did nothing but bump
// updatedAt. Deriving it instead means it's only ever true when the
// content actually differs from what's saved.
const TRACKED_ITEM_FIELDS = ['label', 'amount', 'category', 'recurring', 'dayOfMonth', 'isTransfer']
function computeUnsavedIds(currentItems, baselineItems) {
  const baselineById = new Map((baselineItems || []).map((i) => [i.id, i]))
  const unsaved = []
  for (const item of currentItems) {
    const prev = baselineById.get(item.id)
    if (!prev || TRACKED_ITEM_FIELDS.some((f) => (item[f] ?? null) !== (prev[f] ?? null))) {
      unsaved.push(item.id)
    }
  }
  return unsaved
}
// Same comparison, but also catches rows that were deleted entirely
// (present in the baseline, gone from the live form) — computeUnsavedIds
// above only looks at what's still there, so a plain length check covers
// removals without needing a second full diff.
function itemsMatchSaved(currentItems, baselineItems) {
  const baselineList = baselineItems || []
  if (currentItems.length !== baselineList.length) return false
  return computeUnsavedIds(currentItems, baselineList).length === 0
}
const unsavedIncomeIds  = computed(() => computeUnsavedIds(form.value.incomeItems, savedBaseline.value?.incomeItems))
const unsavedExpenseIds = computed(() => computeUnsavedIds(form.value.expenseItems, savedBaseline.value?.expenseItems))

const isDirty = computed(() => {
  if (!savedBaseline.value) return !isBlank()
  return (
    !itemsMatchSaved(form.value.incomeItems, savedBaseline.value.incomeItems) ||
    !itemsMatchSaved(form.value.expenseItems, savedBaseline.value.expenseItems) ||
    (form.value.notes || '').trim() !== (savedBaseline.value.notes || '').trim()
  )
})

// Pre-fill: let the user pick any past month that has income items or
// recurring expense items — not just the most recent one.
const prefillSources = computed(() =>
  finance.sortedSnapshots
    .filter((s) => {
      if (s.month >= form.value.month) return false
      const hasIncome = (s.incomeItems || []).length > 0
      const hasRecurring = (s.expenseItems || []).some((i) => i.recurring)
      return hasIncome || hasRecurring
    })
    .slice()
    .reverse() // newest first in the dropdown
)

const canPrefill = computed(() => prefillSources.value.length > 0)

// Default to the most recent valid source; user can change via the select.
const prefillSourceMonth = ref(null)
const selectedPrefillSource = computed(() => {
  const target = prefillSourceMonth.value ?? prefillSources.value[0]?.month
  return prefillSources.value.find((s) => s.month === target) ?? prefillSources.value[0] ?? null
})

function doPrefill() {
  const snap = selectedPrefillSource.value
  if (!snap) return
  // Fresh debt items from current account definitions
  const freshDebts = accountsStore.debtAccounts
    .filter((a) => (Number(a.minimumPayment) || 0) > 0)
    .map((account) => ({
      id:         uid(),
      label:      account.name,
      amount:     (Number(account.minimumPayment) || 0) + (Number(account.extraMonthlyPayment) || 0),
      category:   'Debt',
      recurring:  true,
      dayOfMonth: account.paymentDayOfMonth ?? null,
      accountId:  account.id,
    }))
  // Fresh scheduled income for the TARGET month (not the source month's days)
  const scheduledIncome = buildScheduledIncome(form.value.month)
  const scheduledIds = new Set(
    incomeOptionsStore.incomeOptions
      .filter((o) => o.schedule?.type)
      .map((o) => o.id)
  )
  // Manual (non-scheduled) income items from source month
  const manualIncome = (snap.incomeItems || [])
    .filter((i) => !scheduledIds.has(i.scheduleSourceId))
    .map((i) => ({ ...deepClone(i), id: uid() }))

  form.value.incomeItems  = [...scheduledIncome, ...manualIncome]
  form.value.expenseItems = [
    ...freshDebts,
    ...(snap.expenseItems || [])
      .filter((i) => i.recurring && !i.accountId)
      .map((i) => ({ ...deepClone(i), id: uid() })),
  ]
  monthChangeStatus.value = `Pre-filled from ${snap.month}.`
}

// A form is "blank" if the user hasn't entered anything manually.
// Auto-injected debt obligation items (accountId) and scheduled income
// items (scheduleSourceId) don't count — they appear automatically and
// shouldn't suppress the pre-fill banner.
function isBlank() {
  const userExpenses = form.value.expenseItems.filter((i) => !i.accountId)
  const userIncome   = form.value.incomeItems.filter((i) => !i.scheduleSourceId)
  return userIncome.length === 0 && userExpenses.length === 0 && !form.value.notes.trim()
}

async function save() {
  saving.value = true
  error.value = ''
  if (!props.initial && isBlank()) {
    error.value = "Nothing to save yet — add an income or expense line (or a note) first, or just use \"Planning ahead\" below without saving this month."
    saving.value = false
    return
  }
  try {
    await finance.saveSnapshot(form.value)
    emit('saved')
    savedBaseline.value = deepClone(form.value)
    monthChangeStatus.value = ''
    toast.success('Month saved')
    if (!props.initial) form.value = blank()
  } catch (err) {
    error.value = `Couldn't save this month: ${err.message || err}`
    toast.error(`Save failed: ${err.message || err}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <div v-if="showMonthPicker" class="flex items-center gap-3 flex-wrap">
      <label class="font-medium text-sm">Month</label>
      <input
        type="month"
        class="input input-bordered input-sm"
        :value="form.month"
        @change="handleMonthChange($event.target.value)"
        required
      />
      <span v-if="monthChangeStatus" class="text-xs text-base-content/60">{{ monthChangeStatus }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <!-- Pre-fill banner — only when starting a fresh entry with prefillable history -->
      <template v-if="canPrefill && isBlank()">
        <div class="lg:col-span-2 flex items-center justify-between gap-4 rounded-lg border border-base-300 bg-base-200/50 px-4 py-3">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm text-base-content/70 whitespace-nowrap">Pre-fill income + recurring expenses from</p>
            <select
              class="select select-sm select-bordered"
              :value="selectedPrefillSource?.month"
              @change="prefillSourceMonth = $event.target.value"
            >
              <option v-for="s in prefillSources" :key="s.month" :value="s.month">
                {{ formatMonthLong(s.month) }}
              </option>
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-outline shrink-0" @click="doPrefill">
            Pre-fill →
          </button>
        </div>
      </template>

      <LineItemEditor
        v-model="form.incomeItems"
        title="Income"
        placeholder="e.g. Salary, side income"
        :labelSuggestions="finance.incomeSourceOptions"
        :showDayOfMonth="true"
        :showTransfer="true"
        :currentDay="todayDay"
        :unsavedIds="unsavedIncomeIds"
      />

      <div>
        <LineItemEditor
          v-model="form.expenseItems"
          title="Expenses"
          placeholder="e.g. Rent, autopay bills, cash spending"
          :categories="finance.expenseCategories"
          :showRecurring="true"
          :showDayOfMonth="true"
          :currentDay="todayDay"
          :cardTotal="cardSpendThisMonth"
          :unsavedIds="unsavedExpenseIds"
        />
        <p class="text-xs text-base-content/60 mt-2">
          This list is for spending <em>not</em> on a tracked card — rent, autopay bills, cash. Credit card
          spending is logged on the
          <RouterLink to="/cards" class="link link-primary">Credit Cards</RouterLink> page and added
          automatically:
          <span class="font-mono tabular-nums font-medium">{{ formatCurrency(cardSpendThisMonth) }}</span>
          for {{ form.month }}.
        </p>
      </div>
    </div>

    <div class="rounded-lg border border-dashed border-base-300 px-4 py-3 bg-base-200">
      <p class="text-sm text-base-content/70">
        Assets and debts (checking, savings, 401k, loans, ...) are tracked on the
        <RouterLink to="/accounts" class="link link-primary">Accounts</RouterLink> page now — set
        each one up once and just update its balance each month, instead of retyping every
        account here.
      </p>
    </div>

    <div>
      <label class="font-medium text-sm block mb-1">Notes</label>
      <textarea
        class="textarea textarea-bordered w-full bg-base-200"
        rows="2"
        v-model="form.notes"
        placeholder="Anything worth remembering about this month"
      ></textarea>
    </div>

    <!-- Sticky save footer -->
    <div class="sticky bottom-0 z-10 -mx-1 px-1 pb-1 pt-3 pointer-events-none">
      <div class="rounded-xl border border-base-300 bg-base-200 shadow-lg px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto">
        <div class="text-xs text-base-content/40 leading-snug">
          <template v-if="isDirty">
            <span class="text-warning font-medium">Unsaved changes</span>
          </template>
          <template v-else>
            All changes saved
          </template>
        </div>
        <div class="flex items-center gap-3">
          <p v-if="error" class="text-xs text-error max-w-xs leading-snug">{{ error }}</p>
          <button
            type="submit"
            class="btn btn-primary btn-sm"
            :disabled="saving"
            :class="isDirty ? '' : 'btn-outline opacity-60'"
          >
            {{ saving ? 'Saving…' : 'Save month' }}
          </button>
        </div>
      </div>
    </div>

  </form>
</template>
