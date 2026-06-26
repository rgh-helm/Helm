<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useIncomeOptionsStore } from '../stores/incomeOptionsStore'
import { uid } from '../utils/format'

const emit = defineEmits(['done'])
const router = useRouter()
const settings = useSettingsStore()
const cards = useCreditCardStore()
const accounts = useAccountsStore()
const incomeOptions = useIncomeOptionsStore()

// ── Step index ────────────────────────────────────────────
const step = ref(0)
const TOTAL_STEPS = 6

function next() { if (step.value < TOTAL_STEPS - 1) step.value++ }
function back() { if (step.value > 0) step.value-- }

// ── Step 1: Income sources ────────────────────────────────
const incomeRows = ref([
  { id: uid(), label: '', isPrimary: false },
])
function addIncomeRow() {
  incomeRows.value.push({ id: uid(), label: '', isPrimary: false })
}
function removeIncomeRow(id) {
  if (incomeRows.value.length > 1) incomeRows.value = incomeRows.value.filter((r) => r.id !== id)
}

const filledIncomeRows = computed(() => incomeRows.value.filter((r) => r.label.trim()))
const primaryLabels = computed(() => filledIncomeRows.value.filter((r) => r.isPrimary).map((r) => r.label.trim()))
const hasMultipleIncomeSources = computed(() => filledIncomeRows.value.length > 1)

async function saveIncomeStep() {
  if (primaryLabels.value.length) {
    await settings.setPrimaryIncomeLabels(primaryLabels.value)
  }
  // Also register as known income label options
  for (const row of filledIncomeRows.value) {
    await incomeOptions.addIncomeOption(row.label.trim()).catch(() => {})
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
    await accounts.saveAccount({
      id: uid(),
      name: row.name.trim(),
      kind: 'debt',
      interestRatePercent: Number(row.annualRatePercent) || 0,
      minimumPayment: Number(row.minimumPayment) || 0,
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
            <div class="text-4xl mb-2">🏡</div>
            <h1 class="text-2xl font-display font-bold">Welcome to Helm</h1>
            <p class="text-base-content/70 leading-relaxed">
              You're about to set up a financial picture that actually makes sense for your life.
              Helm is built around one idea: <strong>what if you lived entirely on one income, and saved the other?</strong>
            </p>
            <p class="text-base-content/70 leading-relaxed">
              We'll walk you through the essentials in about 5 minutes. At the end, you'll land
              in your first Monthly Entry ready to start logging.
            </p>
            <div class="rounded-xl border border-base-300 bg-base-200/50 p-4 space-y-2">
              <p class="text-sm font-medium">Here's what we'll set up:</p>
              <ul class="text-sm text-base-content/60 space-y-1">
                <li>✦ Your income sources — and which ones to "live on"</li>
                <li>✦ Your fixed recurring expenses</li>
                <li>✦ Your credit cards and spending budgets</li>
                <li>✦ Any debts you're tracking <span class="text-base-content/40">(optional)</span></li>
              </ul>
            </div>
          </div>

          <!-- ── Step 1: Income sources ── -->
          <div v-else-if="step === 1" class="space-y-5">
            <div class="text-4xl mb-2">💰</div>
            <h2 class="text-2xl font-display font-bold">Tell us about your income</h2>
            <p class="text-base-content/70 leading-relaxed">
              Add the income sources that come in each month — salary, freelance, a side business,
              whatever it is. If you have more than one earner in your household, tag which ones
              belong to the <strong>primary earner</strong>. That's the income we'll use to calculate
              your monthly obligations and savings bandwidth.
            </p>

            <div class="space-y-2">
              <div
                v-for="row in incomeRows"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <input
                  type="text"
                  class="input input-sm input-bordered flex-1"
                  placeholder="e.g. Riley's Salary, Freelance, Partner Income"
                  v-model="row.label"
                />
                <label
                  v-if="hasMultipleIncomeSources || filledIncomeRows.length > 0"
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
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="addIncomeRow">
              + Add another source
            </button>

            <p v-if="hasMultipleIncomeSources && !primaryLabels.length" class="text-xs text-warning/80 leading-snug">
              You've added multiple income sources — consider tagging at least one as Primary so the bandwidth
              calculations can separate them.
            </p>
            <p v-if="primaryLabels.length" class="text-xs text-success/80 leading-snug">
              Primary earner income: {{ primaryLabels.join(', ') }}
            </p>
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

            <!-- Welcome: just Next -->
            <button
              v-if="step === 0"
              type="button"
              class="btn btn-primary btn-sm"
              @click="next"
            >Let's get started →</button>

            <!-- Income: save labels then next -->
            <button
              v-else-if="step === 1"
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!filledIncomeRows.length"
              @click="saveIncomeStep"
            >Next →</button>

            <!-- Recurring expenses: next (data saved with first month entry) -->
            <button
              v-else-if="step === 2"
              type="button"
              class="btn btn-primary btn-sm"
              @click="next"
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