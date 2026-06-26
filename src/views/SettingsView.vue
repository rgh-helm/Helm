<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import { useIncomeOptionsStore } from '../stores/incomeOptionsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { categoryColor } from '../utils/chartColors'
import { getScheduledOccurrences, describeSchedule } from '../utils/incomeSchedule'
import { currentMonthKey, formatCurrency } from '../utils/format'
import { useToast } from '../composables/useToast'

const finance = useFinanceStore()
const goals = useGoalsStore()
const cards = useCreditCardStore()
const settings = useSettingsStore()
const categoriesStore = useCategoriesStore()
const incomeOptionsStore = useIncomeOptionsStore()
const accountsStore = useAccountsStore()
const status = ref('')
const toast = useToast()
const storagePath = ref('')
const appVersion = ref('')
const newCategoryName = ref('')
const categoryError = ref('')
const newIncomeOptionName = ref('')
const incomeOptionError = ref('')

// Local editable copy so typing/clearing the field doesn't immediately
// recompute every average in the app on each keystroke — only commits on
// blur/change, via updateTrailingWindow().
const trailingWindowInput = ref(settings.trailingAverageMonths)

const lowBalanceThresholdInput = ref(settings.lowBalanceThreshold)
watch(
  () => settings.lowBalanceThreshold,
  (val) => { lowBalanceThresholdInput.value = val }
)
async function updateLowBalanceThreshold() {
  await settings.setLowBalanceThreshold(lowBalanceThresholdInput.value)
  lowBalanceThresholdInput.value = settings.lowBalanceThreshold
}
watch(
  () => settings.trailingAverageMonths,
  (val) => {
    trailingWindowInput.value = val
  }
)

// Affordability Defaults — several fields, so unlike the trailing window
// these commit via an explicit Save button rather than per-field on-blur.
const affordabilityForm = ref({ ...settings.affordabilityDefaults })
const affordabilitySaved = ref(false)
watch(
  () => settings.affordabilityDefaults,
  (val) => {
    affordabilityForm.value = { ...val }
  }
)

async function saveAffordabilityDefaults() {
  affordabilitySaved.value = false
  await settings.saveAffordabilityDefaults(affordabilityForm.value)
  affordabilitySaved.value = true
  toast.success('Affordability defaults saved')
}

onMounted(async () => {
  storagePath.value = await window.api.getStoragePath()
  appVersion.value = await window.api.getAppVersion()
})

async function updateTrailingWindow() {
  await settings.setTrailingAverageMonths(trailingWindowInput.value)
  trailingWindowInput.value = settings.trailingAverageMonths
}

async function addCategory() {
  categoryError.value = ''
  try {
    await categoriesStore.addCategory(newCategoryName.value)
    newCategoryName.value = ''
  } catch (err) {
    categoryError.value = err.message
  }
}

async function renameCategory(category, newName) {
  categoryError.value = ''
  if (newName.trim() === category.name) return
  try {
    await categoriesStore.renameCategory(category.id, newName)
  } catch (err) {
    categoryError.value = err.message
  }
}

async function updateCategoryColor(category, color) {
  categoryError.value = ''
  try {
    await categoriesStore.setCategoryColor(category.id, color)
  } catch (err) {
    categoryError.value = err.message
  }
}

async function clearCategoryColor(category) {
  await updateCategoryColor(category, null)
}

async function removeCategory(category) {
  if (confirm(`Remove "${category.name}" from the category list? Existing entries that used it won't be changed.`)) {
    await categoriesStore.deleteCategory(category.id)
  }
}

async function addIncomeOption() {
  incomeOptionError.value = ''
  try {
    await incomeOptionsStore.addIncomeOption(newIncomeOptionName.value)
    newIncomeOptionName.value = ''
  } catch (err) {
    incomeOptionError.value = err.message
  }
}

async function renameIncomeOption(option, newName) {
  incomeOptionError.value = ''
  if (newName.trim() === option.name) return
  try {
    await incomeOptionsStore.renameIncomeOption(option.id, newName)
  } catch (err) {
    incomeOptionError.value = err.message
  }
}

async function removeIncomeOption(option) {
  if (confirm(`Remove "${option.name}" from the income options list? Existing entries that used it won't be changed.`)) {
    await incomeOptionsStore.deleteIncomeOption(option.id)
  }
}

// ── Schedule editor ───────────────────────────────────────────────────
const expandedScheduleId = ref(null)
const scheduleAmountDraft = ref('')

function toggleSchedule(id) {
  if (expandedScheduleId.value === id) {
    expandedScheduleId.value = null
  } else {
    expandedScheduleId.value = id
    const option = incomeOptionsStore.incomeOptions.find(o => o.id === id)
    scheduleAmountDraft.value = String(option?.schedule?.amountPerOccurrence ?? '')
  }
}

async function setScheduleType(option, type) {
  const base = { ...(option.schedule || {}), type: type || null }
  if (type === 'weekly')        base.dayOfWeek ??= 4
  if (type === 'biweekly')      { base.dayOfWeek ??= 4; base.anchorDate ??= '' }
  if (type === 'semi-monthly')  base.semiMonthlyDays ??= [1, 15]
  if (type === 'monthly')       base.dayOfMonth ??= 1
  base.amountPerOccurrence = option.schedule?.amountPerOccurrence ?? 0
  await incomeOptionsStore.saveSchedule(option.id, type ? base : null)
}

async function updateScheduleField(option, field, value) {
  const schedule = { ...(option.schedule || {}), [field]: value }
  await incomeOptionsStore.saveSchedule(option.id, schedule)
}

async function updateSemiMonthlyDay(option, index, value) {
  const days = [...(option.schedule?.semiMonthlyDays || [1, 15])]
  days[index] = Math.min(28, Math.max(1, Number(value) || 1))
  await updateScheduleField(option, 'semiMonthlyDays', days)
}

async function commitScheduleAmount(option) {
  const n = parseFloat(scheduleAmountDraft.value)
  if (!isNaN(n) && n >= 0) {
    await updateScheduleField(option, 'amountPerOccurrence', n)
  }
}

// Preview occurrences for an option in the current month
const previewMonth = currentMonthKey()
function previewOccurrences(option) {
  if (!option.schedule?.type || !option.schedule?.amountPerOccurrence) return null
  const draft = { ...option.schedule, amountPerOccurrence: parseFloat(scheduleAmountDraft.value) || option.schedule.amountPerOccurrence }
  const occs = getScheduledOccurrences(draft, previewMonth)
  if (!occs.length) return null
  const days = occs.map(o => `day ${o.dayOfMonth}`).join(', ')
  const total = occs.reduce((a, o) => a + o.amount, 0)
  return `${occs.length} paycheck${occs.length !== 1 ? 's' : ''} — ${days} — ${formatCurrency(total)} total`
}

async function handleExport() {
  status.value = ''
  const result = await window.api.backup.export()
  if (result.canceled) return
  if (result.ok) {
    toast.success(`Backup saved to ${result.path}`)
  } else {
    toast.error(`Export failed: ${result.error}`)
  }
}

async function handleImport() {
  status.value = ''
  const result = await window.api.backup.import()
  if (result.canceled) return
  if (!result.ok) {
    toast.error(`Import failed: ${result.error}`)
    return
  }
  await Promise.all([
    finance.loadSnapshots(),
    cards.loadAll(),
    settings.loadSettings(),
    categoriesStore.loadCategories(),
    accountsStore.loadAll(),
    incomeOptionsStore.loadIncomeOptions(),
  ])
  await goals.loadScenarios()
  toast.success('Backup imported successfully')
}
</script>

<template>
  <div class="space-y-6 max-w-xl">
    <div>
      <h1 class="font-display text-2xl font-semibold">Settings</h1>
      <p class="text-sm text-base-content/60">
        Your data lives only on this device, in a local file — there is no server and nothing
        leaves your machine. Export a backup periodically, especially before reinstalling or
        switching machines.
      </p>
    </div>

    <!-- Auto-save notice -->
    <div class="flex items-center gap-2 text-xs text-base-content/40 -mt-2">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
      Changes on this page save automatically — no Save button needed.
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
      <div>
        <h2 class="font-display font-semibold mb-1">Calculations</h2>
        <label class="label-text font-medium text-sm">Trailing average window</label>
        <div class="flex items-center gap-2 mt-1">
          <input
            type="number"
            class="input input-bordered input-sm w-24"
            v-model.number="trailingWindowInput"
            min="1"
            max="36"
            @change="updateTrailingWindow"
          />
          <span class="text-sm text-base-content/60">months</span>
        </div>
        <p class="text-xs text-base-content/60 mt-1">
          How many recent months feed your average savings rate, average expenses, and per-card
          averages — shown throughout Dashboard, Goals, and Credit Cards.
        </p>
      </div>
      <div>
        <label class="label-text font-medium text-sm">Low balance warning threshold</label>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-sm text-base-content/60">$</span>
          <input
            type="number"
            class="input input-bordered input-sm w-28"
            v-model.number="lowBalanceThresholdInput"
            min="0"
            step="100"
            @change="updateLowBalanceThreshold"
          />
        </div>
        <p class="text-xs text-base-content/60 mt-1">
          The Daily Balance Timeline warns when your projected checking balance dips below this
          amount — including in timing stress-test scenarios.
        </p>
      </div>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
      <div>
        <h2 class="font-display font-semibold mb-1">Bandwidth Widget — Primary Income</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Check the income sources that belong to the primary earner. When at least one is selected,
          the Bandwidth Widget shows a toggle to calculate the CC ceiling on that income alone —
          useful for planning around a scenario where one income covers expenses and the other
          goes entirely to savings.
        </p>
        <div class="space-y-1.5">
          <label
            v-for="label in finance.incomeSourceOptions"
            :key="label"
            class="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              :checked="settings.primaryIncomeLabels.includes(label)"
              @change="e => {
                const current = settings.primaryIncomeLabels
                const next = e.target.checked
                  ? [...current, label]
                  : current.filter(l => l !== label)
                settings.setPrimaryIncomeLabels(next)
              }"
            />
            <span class="text-sm">{{ label }}</span>
          </label>
          <p v-if="!finance.incomeSourceOptions.length" class="text-xs text-base-content/40">
            No income sources found — log at least one month of income first.
          </p>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
      <div>
        <h2 class="font-display font-semibold mb-1">Bandwidth Widget — Excluded Categories</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Checked categories are excluded from the "avg variable expenses" calculation in the
          Bandwidth Widget. Use this for transfers, HYSA deposits, or any one-time movements
          that aren't real month-to-month spending. Defaults to Transfer.
        </p>
        <div class="space-y-1.5">
          <label
            v-for="cat in finance.expenseCategories"
            :key="cat"
            class="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              :checked="settings.excludedVariableCategories.includes(cat)"
              @change="e => {
                const current = settings.excludedVariableCategories
                const next = e.target.checked
                  ? [...current, cat]
                  : current.filter(c => c !== cat)
                settings.setExcludedVariableCategories(next)
              }"
            />
            <span class="text-sm">{{ cat }}</span>
          </label>
          <p v-if="!finance.expenseCategories.length" class="text-xs text-base-content/40">
            No expense categories found yet.
          </p>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
      <div>
        <h2 class="font-display font-semibold mb-1">Affordability Defaults</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Pre-fills the Home Affordability calculator so the same assumptions don't need
          re-entering every visit. <strong>Gross monthly income</strong> matters most here — the
          "Income" you log in Monthly Entry is whatever actually lands in your spendable
          accounts, which may already be net of things like an automatic retirement transfer
          taken before your paycheck hits checking. That's not the same as gross/pre-tax income,
          so set it explicitly if your logged income isn't it.
        </p>
      </div>

      <div>
        <label class="label-text font-medium text-sm">Gross monthly income</label>
        <input
          type="number"
          class="input input-bordered input-sm w-full"
          v-model.number="affordabilityForm.grossMonthlyIncome"
          min="0"
          placeholder="Pre-tax salary, not take-home"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label-text font-medium text-sm">Mortgage rate %</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultMortgageRatePercent"
            min="0"
            step="0.1"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Loan term (years)</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultLoanTermYears"
            min="1"
            max="40"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Property tax %/yr</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultPropertyTaxRatePercent"
            min="0"
            step="0.05"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Insurance $/yr</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultAnnualInsurance"
            min="0"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">HOA $/mo</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultMonthlyHOA"
            min="0"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">Other monthly debt</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultOtherMonthlyDebt"
            min="0"
          />
        </div>
        <div>
          <label class="label-text font-medium text-sm">PMI rate %/yr</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultPmiRatePercent"
            min="0"
            step="0.05"
            placeholder="e.g. 0.5"
          />
          <p class="text-xs text-base-content/60 mt-1">Only actually applied when down payment is under 20%.</p>
        </div>
        <div class="col-span-2">
          <label class="label-text font-medium text-sm">Closing costs %</label>
          <input
            type="number"
            class="input input-bordered input-sm w-full"
            v-model.number="affordabilityForm.defaultClosingCostsPercent"
            min="0"
            step="0.5"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-outline btn-sm" @click="saveAffordabilityDefaults">
          Save defaults
        </button>
        <span v-if="affordabilitySaved" class="text-sm text-success">Saved.</span>
      </div>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-3">
      <div>
        <h2 class="font-display font-semibold mb-1">Categories</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Manage the categories suggested when tagging expenses and card spending. Renaming
          updates every existing entry that used the old name; removing one only drops it from
          the suggestion list — entries that already used it are untouched. Click a swatch to
          pin a category to a specific chart color instead of the automatic one.
        </p>
      </div>
      <div class="space-y-1">
        <div v-for="c in categoriesStore.categories" :key="c.id" class="flex items-center gap-2">
          <input
            type="color"
            class="w-8 h-8 rounded border border-base-300 cursor-pointer shrink-0 p-0.5 bg-base-200"
            :value="c.color || categoryColor(c.name, categoriesStore.categories)"
            :title="c.color ? 'Custom color — click to change' : 'Auto color — click to set a custom one'"
            @change="updateCategoryColor(c, $event.target.value)"
          />
          <input
            type="text"
            class="input input-sm input-bordered flex-1"
            :value="c.name"
            @change="renameCategory(c, $event.target.value)"
          />
          <button
            v-if="c.color"
            type="button"
            class="btn btn-ghost btn-xs"
            title="Reset to automatic color"
            @click="clearCategoryColor(c)"
          >
            Reset
          </button>
          <button type="button" class="btn btn-ghost btn-xs btn-circle text-error" @click="removeCategory(c)">
            ✕
          </button>
        </div>
        <p v-if="!categoriesStore.categories.length" class="text-sm text-base-content/50">No categories yet.</p>
      </div>
      <div class="flex gap-2">
        <input
          type="text"
          class="input input-sm input-bordered flex-1"
          v-model="newCategoryName"
          placeholder="New category name"
          @keyup.enter="addCategory"
        />
        <button type="button" class="btn btn-outline btn-sm" @click="addCategory">+ Add</button>
      </div>
      <p v-if="categoryError" class="text-xs text-error">{{ categoryError }}</p>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-3">
      <div>
        <h2 class="font-display font-semibold mb-1">Income Options</h2>
        <p class="text-xs text-base-content/60 mb-3">
          Manage income sources for Monthly Entry. Click the chevron on any source to configure a
          pay schedule — the app will generate the correct day-of-month entries automatically
          each month so you only need to confirm the amounts.
        </p>
      </div>
      <div class="space-y-1">
        <div v-for="o in incomeOptionsStore.incomeOptions" :key="o.id">

          <!-- Name row -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle shrink-0 transition-transform"
              :class="expandedScheduleId === o.id ? 'rotate-90' : ''"
              title="Configure pay schedule"
              @click="toggleSchedule(o.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
            <input
              type="text"
              class="input input-sm input-bordered flex-1"
              :value="o.name"
              @change="renameIncomeOption(o, $event.target.value)"
            />
            <span v-if="o.schedule?.type" class="text-xs text-primary whitespace-nowrap">
              {{ describeSchedule(o.schedule) }}
            </span>
            <button type="button" class="btn btn-ghost btn-xs btn-circle text-error" @click="removeIncomeOption(o)">✕</button>
          </div>

          <!-- Schedule editor (inline expander) -->
          <div
            v-if="expandedScheduleId === o.id"
            class="ml-7 mt-2 mb-3 p-4 rounded-lg bg-base-200/50 border border-base-300 space-y-3"
          >
            <!-- Schedule type -->
            <div class="flex items-center gap-3">
              <label class="text-xs font-medium w-24 shrink-0">Schedule</label>
              <select
                class="select select-sm select-bordered flex-1"
                :value="o.schedule?.type || ''"
                @change="setScheduleType(o, $event.target.value)"
              >
                <option value="">None — manual entry</option>
                <option value="weekly">Weekly (same day every week)</option>
                <option value="biweekly">Biweekly (every other week)</option>
                <option value="semi-monthly">Semi-monthly (two fixed dates)</option>
                <option value="monthly">Monthly (one fixed date)</option>
              </select>
            </div>

            <template v-if="o.schedule?.type">
              <!-- Day of week (weekly / biweekly) -->
              <div v-if="o.schedule.type === 'weekly' || o.schedule.type === 'biweekly'" class="flex items-center gap-3">
                <label class="text-xs font-medium w-24 shrink-0">Payday</label>
                <select
                  class="select select-sm select-bordered flex-1"
                  :value="o.schedule.dayOfWeek ?? 4"
                  @change="updateScheduleField(o, 'dayOfWeek', Number($event.target.value))"
                >
                  <option v-for="(d, i) in ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']" :key="i" :value="i">{{ d }}</option>
                </select>
              </div>

              <!-- Anchor date (biweekly only) -->
              <div v-if="o.schedule.type === 'biweekly'" class="flex items-center gap-3">
                <label class="text-xs font-medium w-24 shrink-0">Anchor date</label>
                <div class="flex-1">
                  <input
                    type="date"
                    class="input input-sm input-bordered w-full"
                    :value="o.schedule.anchorDate || ''"
                    @change="updateScheduleField(o, 'anchorDate', $event.target.value)"
                  />
                  <p class="text-[10px] text-base-content/40 mt-1">Any known payday — used to determine which weeks are pay weeks.</p>
                </div>
              </div>

              <!-- Semi-monthly days -->
              <div v-if="o.schedule.type === 'semi-monthly'" class="flex items-center gap-3">
                <label class="text-xs font-medium w-24 shrink-0">Days</label>
                <div class="flex items-center gap-2">
                  <input
                    type="number" min="1" max="28"
                    class="input input-sm input-bordered w-20 font-mono text-center"
                    :value="o.schedule.semiMonthlyDays?.[0] ?? 1"
                    @change="updateSemiMonthlyDay(o, 0, $event.target.value)"
                  />
                  <span class="text-base-content/40 text-xs">and</span>
                  <input
                    type="number" min="1" max="28"
                    class="input input-sm input-bordered w-20 font-mono text-center"
                    :value="o.schedule.semiMonthlyDays?.[1] ?? 15"
                    @change="updateSemiMonthlyDay(o, 1, $event.target.value)"
                  />
                  <span class="text-xs text-base-content/40">of each month</span>
                </div>
              </div>

              <!-- Monthly day -->
              <div v-if="o.schedule.type === 'monthly'" class="flex items-center gap-3">
                <label class="text-xs font-medium w-24 shrink-0">Day</label>
                <div class="flex items-center gap-2">
                  <input
                    type="number" min="1" max="28"
                    class="input input-sm input-bordered w-20 font-mono text-center"
                    :value="o.schedule.dayOfMonth ?? 1"
                    @change="updateScheduleField(o, 'dayOfMonth', Math.min(28, Math.max(1, Number($event.target.value) || 1)))"
                  />
                  <span class="text-xs text-base-content/40">of each month</span>
                </div>
              </div>

              <!-- Amount per occurrence -->
              <div class="flex items-center gap-3">
                <label class="text-xs font-medium w-24 shrink-0">Per paycheck</label>
                <input
                  type="number" step="0.01" min="0"
                  class="input input-sm input-bordered w-36 font-mono"
                  placeholder="0.00"
                  :value="scheduleAmountDraft"
                  @input="scheduleAmountDraft = $event.target.value"
                  @blur="commitScheduleAmount(o)"
                />
              </div>

              <!-- Month preview -->
              <div v-if="previewOccurrences(o)" class="text-xs text-base-content/50 bg-base-200 rounded px-3 py-2">
                <span class="font-medium">This month:</span> {{ previewOccurrences(o) }}
              </div>
            </template>
          </div>
        </div>

        <p v-if="!incomeOptionsStore.incomeOptions.length" class="text-sm text-base-content/50">
          No income options yet.
        </p>
      </div>
      <div class="flex gap-2">
        <input
          type="text"
          class="input input-sm input-bordered flex-1"
          v-model="newIncomeOptionName"
          placeholder="New income source name"
          @keyup.enter="addIncomeOption"
        />
        <button type="button" class="btn btn-outline btn-sm" @click="addIncomeOption">+ Add</button>
      </div>
      <p v-if="incomeOptionError" class="text-xs text-error">{{ incomeOptionError }}</p>
    </div>

    <div class="rounded-lg border border-base-300 bg-base-200 p-5 space-y-4">
      <div>
        <h2 class="font-display font-semibold mb-1">Storage location</h2>
        <p class="text-sm text-base-content/60 font-mono break-all">{{ storagePath || 'Loading…' }}</p>
      </div>
      <div class="divider my-0"></div>
      <div>
        <h2 class="font-display font-semibold mb-1">App version</h2>
        <p class="text-sm text-base-content/60 font-mono">{{ appVersion ? `v${appVersion}` : 'Loading…' }}</p>
      </div>
      <div class="divider my-0"></div>
      <div>
        <h2 class="font-display font-semibold mb-1">Backup</h2>
        <p class="text-sm text-base-content/60 mb-3">Save all your monthly entries and scenarios as a JSON file.</p>
        <button type="button" class="btn btn-outline btn-sm" @click="handleExport">Export backup</button>
      </div>
      <div class="divider my-0"></div>
      <div>
        <h2 class="font-display font-semibold mb-1">Restore</h2>
        <p class="text-sm text-base-content/60 mb-3">
          Importing replaces all current data with the contents of the backup file.
        </p>
        <button type="button" class="btn btn-outline btn-sm" @click="handleImport">Import backup</button>
      </div>
      <div class="divider my-0"></div>
      <div>
        <h2 class="font-display font-semibold mb-1">Setup guide</h2>
        <p class="text-sm text-base-content/60 mb-3">
          Re-run the onboarding wizard to update your income sources, recurring expenses, cards, or debts.
        </p>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          @click="settings.setOnboardingComplete(false)"
        >Restart setup guide</button>
      </div>
    </div>
  </div>
</template>