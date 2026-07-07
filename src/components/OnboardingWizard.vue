<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useIncomeOptionsStore } from '../stores/incomeOptionsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useGoalsStore } from '../stores/goalsStore'
import { useCategoriesStore } from '../stores/categoriesStore'
import { uid, currentMonthKey } from '../utils/format'

const emit = defineEmits(['done'])
const router = useRouter()
const settings = useSettingsStore()
const cards = useCreditCardStore()
const accounts = useAccountsStore()
const incomeOptions = useIncomeOptionsStore()
const finance = useFinanceStore()
const goals = useGoalsStore()
const categoriesStore = useCategoriesStore()

// ── Step 0: Import existing data (skips the rest of the wizard) ──
// 'idle' | 'importing' | 'error' | 'done'
const importStatus = ref('idle')
const importError = ref('')
const importWarnings = ref([])

async function handleImportClick() {
  importStatus.value = 'importing'
  importError.value = ''
  const result = await window.api.backup.import()
  if (result.canceled) {
    importStatus.value = 'idle'
    return
  }
  if (!result.ok) {
    importError.value = result.error || 'Something went wrong reading that file.'
    importStatus.value = 'error'
    return
  }
  // The IPC layer already wrote the imported data to data.json — reload
  // every store from it so the renderer's Pinia state actually reflects
  // it (same reload set App.vue does on boot, and Settings does after a
  // manual restore).
  await Promise.all([
    finance.loadSnapshots(),
    cards.loadAll(),
    settings.loadSettings(),
    categoriesStore.loadCategories(),
    incomeOptions.loadIncomeOptions(),
    accounts.loadAll(),
  ])
  await goals.loadScenarios()
  // Force this regardless of what the imported file's settings said —
  // an import means there's real history to look at, never the
  // fresh-start wizard.
  await settings.setOnboardingComplete(true)
  importWarnings.value = result.warnings || []
  importStatus.value = 'done'
}

function completeImport() {
  emit('done')
  router.push('/')
}

// ── Step index ────────────────────────────────────────────
const step = ref(0)
const TOTAL_STEPS = 6

function next() { if (step.value < TOTAL_STEPS - 1) step.value++ }
function back() { if (step.value > 0) step.value-- }

// ── Step 1: Income sources ────────────────────────────────
// Asked up front so the "tag a primary earner" language (written for a
// two-earner household — Helm's core dual-income premise) doesn't show
// up confusingly for a single-earner household, where there's no second
// income to separate out in the first place.
const earnerCount = ref(null) // 'one' | 'multiple'

function blankIncomeRow() {
  return {
    id: uid(),
    label: '',
    isPrimary: false,
    // Optional recurring-paycheck schedule — collapsed by default so a
    // quick "just get me through onboarding" pass isn't forced to deal
    // with pay-schedule details.
    hasSchedule: false,
    scheduleType: 'monthly',
    amountPerOccurrence: '',
    dayOfWeek: 4,        // Thursday — the most common US payday default
    anchorDate: '',
    semiMonthlyDay1: 1,
    semiMonthlyDay2: 15,
    dayOfMonth: 1,
  }
}
const incomeRows = ref([blankIncomeRow()])
function addIncomeRow() {
  incomeRows.value.push(blankIncomeRow())
}
function removeIncomeRow(id) {
  if (incomeRows.value.length > 1) incomeRows.value = incomeRows.value.filter((r) => r.id !== id)
}

const filledIncomeRows = computed(() => incomeRows.value.filter((r) => r.label.trim()))
// A single-earner household has nothing to distinguish a "primary"
// income from — every income source here already is the one the
// household lives on, so it's all primary without asking.
const primaryLabels = computed(() =>
  earnerCount.value === 'one'
    ? filledIncomeRows.value.map((r) => r.label.trim())
    : filledIncomeRows.value.filter((r) => r.isPrimary).map((r) => r.label.trim())
)
const hasMultipleIncomeSources = computed(() => filledIncomeRows.value.length > 1)

// Converts a row's schedule fields into the { type, ... } shape
// getScheduledOccurrences expects — null if the row didn't turn
// scheduling on, so it's saved as "no schedule set" same as before.
function buildScheduleFromRow(row) {
  if (!row.hasSchedule) return null
  const amountPerOccurrence = Number(row.amountPerOccurrence) || 0
  if (row.scheduleType === 'weekly') {
    return { type: 'weekly', dayOfWeek: Number(row.dayOfWeek), amountPerOccurrence }
  }
  if (row.scheduleType === 'biweekly') {
    return {
      type: 'biweekly',
      dayOfWeek: Number(row.dayOfWeek),
      anchorDate: row.anchorDate || null,
      amountPerOccurrence,
    }
  }
  if (row.scheduleType === 'semi-monthly') {
    return {
      type: 'semi-monthly',
      semiMonthlyDays: [Number(row.semiMonthlyDay1) || 1, Number(row.semiMonthlyDay2) || 15],
      amountPerOccurrence,
    }
  }
  return { type: 'monthly', dayOfMonth: Number(row.dayOfMonth) || 1, amountPerOccurrence }
}

async function saveIncomeStep() {
  if (primaryLabels.value.length) {
    await settings.setPrimaryIncomeLabels(primaryLabels.value)
  }
  // Also register as known income label options, carrying over a
  // recurring schedule where one was set.
  for (const row of filledIncomeRows.value) {
    await incomeOptions.addIncomeOption(row.label.trim(), buildScheduleFromRow(row)).catch(() => {})
  }
  next()
}

// ── Step 2: Recurring expenses ────────────────────────────
const expenseRows = ref([
  { id: uid(), label: '', amount: '' },
])
function addExpenseRow() {
  expenseRows.value.push({ id: uid(), label: '', amount: '' })
}
function removeExpenseRow(id) {
  if (expenseRows.value.length > 1) expenseRows.value = expenseRows.value.filter((r) => r.id !== id)
}
const filledExpenseRows = computed(() => expenseRows.value.filter((r) => r.label.trim()))

// Recurring expenses aren't their own top-level entity in Helm — they're
// expenseItems on a snapshot flagged `recurring: true`, which is what
// makes them pre-fill into future months (see SnapshotForm's
// createBlankForMonth). Without this, whatever the user types here has
// nowhere to go and just vanishes once the wizard closes.
async function saveExpensesStep() {
  if (filledExpenseRows.value.length) {
    await finance.saveSnapshot({
      id: null,
      month: currentMonthKey(),
      incomeItems: [],
      expenseItems: filledExpenseRows.value.map((row) => ({
        id: uid(),
        label: row.label.trim(),
        amount: Number(row.amount) || 0,
        category: null,
        recurring: true,
      })),
      notes: '',
    })
  }
  next()
}

// ── Step 3: Credit cards ──────────────────────────────────
const cardRows = ref([
  { id: uid(), name: '', targetBudget: '' },
])
function addCardRow() {
  cardRows.value.push({ id: uid(), name: '', targetBudget: '' })
}
function removeCardRow(id) {
  if (cardRows.value.length > 1) cardRows.value = cardRows.value.filter((r) => r.id !== id)
}
const filledCardRows = computed(() => cardRows.value.filter((r) => r.name.trim()))

async function saveCardsStep() {
  for (const row of filledCardRows.value) {
    await cards.saveCard({
      id: uid(),
      name: row.name.trim(),
      targetBudget: Number(row.targetBudget) || 0,
      statementDueDay: null,
    })
  }
  next()
}

// ── Step 4: Debt accounts (optional) ─────────────────────
const debtRows = ref([
  { id: uid(), name: '', balance: '', annualRatePercent: '', minimumPayment: '' },
])
function addDebtRow() {
  debtRows.value.push({ id: uid(), name: '', balance: '', annualRatePercent: '', minimumPayment: '' })
}
function removeDebtRow(id) {
  debtRows.value = debtRows.value.filter((r) => r.id !== id)
}
const filledDebtRows = computed(() => debtRows.value.filter((r) => r.name.trim()))

async function saveDebtsStep() {
  for (const row of filledDebtRows.value) {
    const saved = await accounts.saveAccount({
      id: uid(),
      name: row.name.trim(),
      kind: 'debt',
      interestRatePercent: Number(row.annualRatePercent) || 0,
      minimumPayment: Number(row.minimumPayment) || 0,
    })
    // saveAccount's own client-side id is discarded server-side for a
    // brand-new record — use the real id it comes back with, or the
    // balance below silently attaches to nothing.
    await accounts.saveBalance({
      accountId: saved.id,
      month: currentMonthKey(),
      amount: Number(row.balance) || 0,
    })
  }
  next()
}

// ── Finish ────────────────────────────────────────────────
async function finish() {
  await settings.setOnboardingComplete(true)
  emit('done')
  router.push('/entry')
}
</script>

<template>
  <!-- Full-screen overlay -->
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-base-300/80 backdrop-blur-sm">
      <div class="w-full max-w-2xl mx-4 bg-base-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 90vh">

        <!-- Progress bar -->
        <div class="h-1 bg-base-300 shrink-0">
          <div
            class="h-full bg-primary transition-all duration-500"
            :style="`width: ${((step) / (TOTAL_STEPS - 1)) * 100}%`"
          ></div>
        </div>

        <!-- Step content -->
        <div class="flex-1 overflow-y-auto p-8">

          <!-- ── Step 0: Welcome ── -->
          <div v-if="step === 0" class="space-y-5">

            <!-- Default: welcome + import/fresh-start fork -->
            <template v-if="importStatus === 'idle'">
              <div class="text-4xl mb-2">🏡</div>
              <h1 class="text-2xl font-display font-bold">Welcome to Helm</h1>
              <p class="text-base-content/70 leading-relaxed">
                You're about to set up a financial picture that actually makes sense for your life.
                Helm is built around one idea: <strong>figure out what you actually need to live on, and put
                everything above that to work.</strong> For a two-earner household that often means living on
                one income and saving the other — but the same idea holds either way.
              </p>
              <p class="text-base-content/70 leading-relaxed">
                Already have a Helm backup or <code>data.json</code> from another install? You can import it
                directly and skip setup entirely.
              </p>
              <div class="rounded-xl border border-base-300 bg-base-200/50 p-4 space-y-2">
                <p class="text-sm font-medium">Starting fresh, we'll walk you through:</p>
                <ul class="text-sm text-base-content/60 space-y-1">
                  <li>✦ Your income sources — and, if it applies, which to live on</li>
                  <li>✦ Your fixed recurring expenses</li>
                  <li>✦ Your credit cards and spending budgets</li>
                  <li>✦ Any debts you're tracking <span class="text-base-content/40">(optional)</span></li>
                </ul>
              </div>
            </template>

            <!-- Import in progress -->
            <template v-else-if="importStatus === 'importing'">
              <div class="text-4xl mb-2">⏳</div>
              <h1 class="text-2xl font-display font-bold">Importing your data…</h1>
              <p class="text-base-content/70 leading-relaxed">
                Reading your file and rebuilding accounts, cards, and history from it.
              </p>
            </template>

            <!-- Import failed -->
            <template v-else-if="importStatus === 'error'">
              <div class="text-4xl mb-2">⚠️</div>
              <h1 class="text-2xl font-display font-bold">Import didn't go through</h1>
              <p class="text-base-content/70 leading-relaxed">{{ importError }}</p>
              <p class="text-sm text-base-content/50 leading-relaxed">
                Make sure you're selecting a Helm backup file — either one exported from
                Settings → Export backup, or an existing <code>data.json</code>. You can try again,
                or start fresh instead.
              </p>
            </template>

            <!-- Import succeeded -->
            <template v-else-if="importStatus === 'done'">
              <div class="text-4xl mb-2">📥</div>
              <h1 class="text-2xl font-display font-bold">Import complete</h1>
              <p class="text-base-content/70 leading-relaxed">
                Your existing data is loaded in — accounts, snapshots, cards, and history are all here.
              </p>
              <div v-if="importWarnings.length" class="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-2">
                <p class="text-sm font-medium">A few things to note:</p>
                <ul class="text-sm text-base-content/60 space-y-1 list-disc list-inside">
                  <li v-for="(warning, i) in importWarnings" :key="i">{{ warning }}</li>
                </ul>
              </div>
              <p v-else class="text-sm text-success/80">Everything came through cleanly — no gaps found.</p>
            </template>

          </div>

          <!-- ── Step 1: Income sources ── -->
          <div v-else-if="step === 1" class="space-y-5">
            <div class="text-4xl mb-2">💰</div>
            <h2 class="text-2xl font-display font-bold">Tell us about your income</h2>

            <!-- Earner count: asked first so the rest of this step's copy and -->
            <!-- fields can speak directly to a one- or multi-earner household. -->
            <div class="rounded-xl border border-base-300 bg-base-200/50 p-4 space-y-2">
              <p class="text-sm font-medium">How many earners are in your household?</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm"
                  :class="earnerCount === 'one' ? 'btn-primary' : 'btn-outline'"
                  @click="earnerCount = 'one'"
                >Just me</button>
                <button
                  type="button"
                  class="btn btn-sm"
                  :class="earnerCount === 'multiple' ? 'btn-primary' : 'btn-outline'"
                  @click="earnerCount = 'multiple'"
                >Two or more</button>
              </div>
            </div>

            <template v-if="earnerCount">
              <p class="text-base-content/70 leading-relaxed">
                <template v-if="earnerCount === 'one'">
                  Add the income sources that come in each month — salary, freelance, a side business,
                  whatever it is. Since it's just you, all of it counts as the income you live on —
                  nothing to tag or separate out.
                </template>
                <template v-else>
                  Add the income sources that come in each month — salary, freelance, a side business,
                  whatever it is. Tag which ones belong to the <strong>primary earner</strong> — that's
                  the income we'll use to calculate your monthly obligations and savings bandwidth, with
                  everything else treated as the income you're setting aside.
                </template>
              </p>

              <div class="space-y-3">
                <div
                  v-for="row in incomeRows"
                  :key="row.id"
                  class="rounded-lg border border-base-300 p-2.5 space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      class="input input-sm input-bordered flex-1"
                      placeholder="e.g. Riley's Salary, Freelance, Partner Income"
                      v-model="row.label"
                    />
                    <label
                      v-if="earnerCount === 'multiple'"
                      class="flex items-center gap-1.5 text-xs text-base-content/60 cursor-pointer select-none shrink-0"
                      :title="'Mark as primary earner income'"
                    >
                      <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" v-model="row.isPrimary" />
                      Primary
                    </label>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error shrink-0"
                      @click="removeIncomeRow(row.id)"
                      :disabled="incomeRows.length === 1"
                    >✕</button>
                  </div>

                  <label class="flex items-center gap-1.5 text-xs text-base-content/60 cursor-pointer select-none">
                    <input type="checkbox" class="checkbox checkbox-xs" v-model="row.hasSchedule" />
                    This is a recurring paycheck — pre-fill it automatically each month
                  </label>

                  <div v-if="row.hasSchedule" class="flex flex-wrap items-center gap-2 pl-1">
                    <select class="select select-xs select-bordered" v-model="row.scheduleType">
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="semi-monthly">Twice a month</option>
                      <option value="monthly">Monthly</option>
                    </select>

                    <div class="relative">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xs">$</span>
                      <input
                        type="number"
                        class="input input-xs input-bordered w-24 pl-6 font-mono text-right"
                        placeholder="Amount"
                        v-model="row.amountPerOccurrence"
                      />
                    </div>
                    <span class="text-xs text-base-content/40">per paycheck</span>

                    <!-- Weekly / biweekly: day of week -->
                    <select
                      v-if="row.scheduleType === 'weekly' || row.scheduleType === 'biweekly'"
                      class="select select-xs select-bordered"
                      v-model="row.dayOfWeek"
                    >
                      <option :value="0">Sunday</option>
                      <option :value="1">Monday</option>
                      <option :value="2">Tuesday</option>
                      <option :value="3">Wednesday</option>
                      <option :value="4">Thursday</option>
                      <option :value="5">Friday</option>
                      <option :value="6">Saturday</option>
                    </select>

                    <!-- Biweekly: anchor payday to lock in the every-other-week cadence -->
                    <label v-if="row.scheduleType === 'biweekly'" class="flex items-center gap-1.5 text-xs text-base-content/60">
                      Last payday:
                      <input type="date" class="input input-xs input-bordered" v-model="row.anchorDate" />
                    </label>

                    <!-- Semi-monthly: two fixed days -->
                    <template v-if="row.scheduleType === 'semi-monthly'">
                      <label class="flex items-center gap-1 text-xs text-base-content/60">
                        Days
                        <input type="number" min="1" max="31" class="input input-xs input-bordered w-14" v-model="row.semiMonthlyDay1" />
                        &amp;
                        <input type="number" min="1" max="31" class="input input-xs input-bordered w-14" v-model="row.semiMonthlyDay2" />
                      </label>
                    </template>

                    <!-- Monthly: one fixed day -->
                    <label v-if="row.scheduleType === 'monthly'" class="flex items-center gap-1 text-xs text-base-content/60">
                      Day
                      <input type="number" min="1" max="31" class="input input-xs input-bordered w-14" v-model="row.dayOfMonth" />
                    </label>
                  </div>
                </div>
              </div>

              <button type="button" class="btn btn-ghost btn-xs" @click="addIncomeRow">
                + Add another source
              </button>

              <p v-if="earnerCount === 'multiple' && hasMultipleIncomeSources && !primaryLabels.length" class="text-xs text-warning/80 leading-snug">
                You've added multiple income sources — consider tagging at least one as Primary so the bandwidth
                calculations can separate them.
              </p>
              <p v-if="earnerCount === 'multiple' && primaryLabels.length" class="text-xs text-success/80 leading-snug">
                Primary earner income: {{ primaryLabels.join(', ') }}
              </p>
            </template>
          </div>

          <!-- ── Step 2: Recurring expenses ── -->
          <div v-else-if="step === 2" class="space-y-5">
            <div class="text-4xl mb-2">📋</div>
            <h2 class="text-2xl font-display font-bold">Your fixed monthly expenses</h2>
            <p class="text-base-content/70 leading-relaxed">
              These are the bills that show up every month like clockwork — rent or mortgage, utilities,
              subscriptions, insurance. We call them <strong>fixed obligations</strong>, and they're the
              first thing subtracted from your income when figuring out how much bandwidth you have.
            </p>
            <p class="text-xs text-base-content/40">
              Don't worry about one-off or variable spending — that gets averaged from your monthly entries over time.
            </p>

            <div class="space-y-2">
              <div
                v-for="row in expenseRows"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <input
                  type="text"
                  class="input input-sm input-bordered flex-1"
                  placeholder="e.g. Rent, Netflix, Car insurance"
                  v-model="row.label"
                />
                <div class="relative shrink-0">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xs">$</span>
                  <input
                    type="number"
                    class="input input-sm input-bordered w-28 pl-6 font-mono text-right"
                    placeholder="0"
                    v-model="row.amount"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error shrink-0"
                  @click="removeExpenseRow(row.id)"
                  :disabled="expenseRows.length === 1"
                >✕</button>
              </div>
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="addExpenseRow">
              + Add another expense
            </button>

            <p class="text-xs text-base-content/40 leading-snug">
              These will be pre-filled as recurring items in your monthly entries going forward.
              You can always add, edit, or remove them later.
            </p>
          </div>

          <!-- ── Step 3: Credit cards ── -->
          <div v-else-if="step === 3" class="space-y-5">
            <div class="text-4xl mb-2">💳</div>
            <h2 class="text-2xl font-display font-bold">Your credit cards</h2>
            <p class="text-base-content/70 leading-relaxed">
              Add the cards you use regularly. We'll track your spending against a monthly budget for
              each one. The app will suggest a <strong>total card ceiling</strong> based on your income
              and fixed expenses — you can spread that across your cards however you like.
            </p>
            <p class="text-xs text-base-content/40">
              Not sure what budget to set? Leave it at 0 for now — the bandwidth widget will suggest one once you've logged a month or two.
            </p>

            <div class="space-y-2">
              <div
                v-for="row in cardRows"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <input
                  type="text"
                  class="input input-sm input-bordered flex-1"
                  placeholder="e.g. Chase Sapphire, Amex Blue"
                  v-model="row.name"
                />
                <div class="relative shrink-0">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xs">$</span>
                  <input
                    type="number"
                    class="input input-sm input-bordered w-28 pl-6 font-mono text-right"
                    placeholder="Budget"
                    v-model="row.targetBudget"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error shrink-0"
                  @click="removeCardRow(row.id)"
                  :disabled="cardRows.length === 1"
                >✕</button>
              </div>
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="addCardRow">
              + Add another card
            </button>
          </div>

          <!-- ── Step 4: Debt accounts (optional) ── -->
          <div v-else-if="step === 4" class="space-y-5">
            <div class="text-4xl mb-2">📉</div>
            <h2 class="text-2xl font-display font-bold">Any debts to track?
              <span class="text-base font-normal text-base-content/40 ml-2">optional</span>
            </h2>
            <p class="text-base-content/70 leading-relaxed">
              If you have loans, car payments, or other debts, add them here and we'll track payoff
              timelines and automatically inject the minimum payments into your monthly expenses.
              <strong>This step is completely optional</strong> — you can always add debts later in Accounts.
            </p>

            <div class="space-y-2">
              <div
                v-for="row in debtRows"
                :key="row.id"
                class="flex flex-wrap items-center gap-2"
              >
                <input
                  type="text"
                  class="input input-sm input-bordered flex-1 min-w-[140px]"
                  placeholder="e.g. Car loan, Student loan"
                  v-model="row.name"
                />
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xs">$</span>
                  <input type="number" class="input input-sm input-bordered w-28 pl-6 font-mono text-right" placeholder="Balance" v-model="row.balance" />
                </div>
                <input type="number" class="input input-sm input-bordered w-20 font-mono text-right" placeholder="APR %" v-model="row.annualRatePercent" />
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xs">$</span>
                  <input type="number" class="input input-sm input-bordered w-28 pl-6 font-mono text-right" placeholder="Min. payment" v-model="row.minimumPayment" />
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error shrink-0"
                  @click="removeDebtRow(row.id)"
                >✕</button>
              </div>
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="addDebtRow">
              + Add another debt
            </button>
          </div>

          <!-- ── Step 5: All set ── -->
          <div v-else-if="step === 5" class="space-y-5 text-center">
            <div class="text-5xl mb-2">🎉</div>
            <h2 class="text-2xl font-display font-bold">You're all set!</h2>
            <p class="text-base-content/70 leading-relaxed">
              Your foundation is in place. We'll take you to this month's entry screen so you can
              log your first snapshot — income, expenses, and anything else that happened this month.
            </p>
            <div class="rounded-xl border border-base-300 bg-base-200/50 p-5 text-left space-y-2 mt-2">
              <p class="text-sm font-medium mb-3">A few things to know as you get started:</p>
              <p class="text-sm text-base-content/60 leading-relaxed">
                <strong class="text-base-content/80">The Dashboard</strong> shows your big picture —
                bandwidth, card spending, and savings health — but it gets smarter the more months you log.
              </p>
              <p class="text-sm text-base-content/60 leading-relaxed">
                <strong class="text-base-content/80">Monthly Entry</strong> is where you log each month's
                income and expenses. The app pre-fills what it can based on recurring items and your income schedule.
              </p>
              <p class="text-sm text-base-content/60 leading-relaxed">
                <strong class="text-base-content/80">Credit Cards</strong> is where you track spend-vs-budget
                and see how your card spending affects your secondary income savings target.
              </p>
            </div>
            <p class="text-xs text-base-content/40 mt-2">
              You can revisit this setup guide anytime from Settings → Restart setup guide.
            </p>
          </div>

        </div>

        <!-- Footer nav -->
        <div class="shrink-0 px-8 py-5 border-t border-base-300 flex items-center justify-between">
          <!-- Step counter -->
          <div class="flex items-center gap-1.5">
            <div
              v-for="i in TOTAL_STEPS"
              :key="i"
              class="rounded-full transition-all duration-300"
              :class="i - 1 === step
                ? 'w-4 h-2 bg-primary'
                : i - 1 < step
                  ? 'w-2 h-2 bg-primary/40'
                  : 'w-2 h-2 bg-base-300'"
            ></div>
          </div>

          <div class="flex items-center gap-3">
            <button
              v-if="step > 0"
              type="button"
              class="btn btn-ghost btn-sm"
              @click="back"
            >← Back</button>

            <!-- Welcome: fork into import vs. fresh start, or resolve an import attempt -->
            <template v-if="step === 0 && importStatus === 'idle'">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="handleImportClick"
              >📥 Import existing data</button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="next"
              >Start fresh →</button>
            </template>
            <button
              v-else-if="step === 0 && importStatus === 'importing'"
              type="button"
              class="btn btn-primary btn-sm"
              disabled
            >Importing…</button>
            <template v-else-if="step === 0 && importStatus === 'error'">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="importStatus = 'idle'"
              >← Back</button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="handleImportClick"
              >Try again</button>
            </template>
            <button
              v-else-if="step === 0 && importStatus === 'done'"
              type="button"
              class="btn btn-primary btn-sm"
              @click="completeImport"
            >Take me to my data →</button>

            <!-- Income: save labels then next -->
            <button
              v-else-if="step === 1"
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!earnerCount || !filledIncomeRows.length"
              @click="saveIncomeStep"
            >Next →</button>

            <!-- Recurring expenses: save as a recurring snapshot, then next -->
            <button
              v-else-if="step === 2"
              type="button"
              class="btn btn-primary btn-sm"
              @click="saveExpensesStep"
            >Next →</button>

            <!-- Cards: save cards then next -->
            <button
              v-else-if="step === 3"
              type="button"
              class="btn btn-primary btn-sm"
              @click="saveCardsStep"
            >Next →</button>

            <!-- Debts: optional — skip or save -->
            <template v-else-if="step === 4">
              <button
                type="button"
                class="btn btn-ghost btn-sm text-base-content/40"
                @click="next"
              >Skip for now</button>
              <button
                v-if="filledDebtRows.length"
                type="button"
                class="btn btn-primary btn-sm"
                @click="saveDebtsStep"
              >Save & continue →</button>
              <button
                v-else
                type="button"
                class="btn btn-primary btn-sm"
                @click="next"
              >Continue →</button>
            </template>

            <!-- Finish -->
            <button
              v-else-if="step === 5"
              type="button"
              class="btn btn-primary btn-sm"
              @click="finish"
            >Take me to my first entry →</button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>