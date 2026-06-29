<script setup>
import { computed, ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import CreditCardForm from '../components/CreditCardForm.vue'
import CreditCardRow from '../components/CreditCardRow.vue'
import CardSpendChart from '../components/CardSpendChart.vue'
import CategoryBreakdownChart from '../components/CategoryBreakdownChart.vue'
import BandwidthWidget from '../components/BandwidthWidget.vue'
import CardSpendWidget from '../components/CardSpendWidget.vue'
import { formatCurrency, currentMonthKey } from '../utils/format'

const cards = useCreditCardStore()
const showForm = ref(false)
const editing = ref(null)
const activeTab = ref('cards')

function startCreate() {
  editing.value = null
  showForm.value = true
}

function startEdit(card) {
  editing.value = card
  showForm.value = true
}

function onSaved() {
  showForm.value = false
  editing.value = null
}

const thisMonth = currentMonthKey()
const scopeMonth = ref('')

const collectiveBreakdown = computed(() => cards.allCardsCategoryBreakdown(scopeMonth.value || null))
const collectiveTotal = computed(() => collectiveBreakdown.value.reduce((acc, c) => acc + c.amount, 0))

const cardsWithSpendInScope = computed(() =>
  cards.cards
    .map((card) => ({ card, breakdown: cards.cardCategoryBreakdown(card.id, scopeMonth.value || null) }))
    .filter(({ breakdown }) => breakdown.length)
)
</script>

<template>
  <div class="space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-display text-2xl font-semibold">Credit Cards</h1>
        <p class="text-sm text-base-content/60">
          Since these are paid off monthly, balances are tracked as spending — not debt — and roll
          automatically into your Expenses total.
        </p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" @click="startCreate">+ Add card</button>
    </div>

    <!-- Add/edit form -->
    <div v-if="showForm" class="rounded-lg border border-primary/40 bg-base-200 p-5 max-w-xl">
      <h2 class="font-display font-semibold mb-3">{{ editing ? 'Edit card' : 'New card' }}</h2>
      <CreditCardForm :initial="editing" @saved="onSaved" @cancel="showForm = false" />
    </div>

    <div v-if="!cards.cards.length && !showForm" class="rounded-lg border border-dashed border-base-300 p-10 text-center">
      <p class="text-base-content/70 mb-3">No cards yet. Add one to start tracking spend by card.</p>
      <button type="button" class="btn btn-primary btn-sm" @click="startCreate">Add a card</button>
    </div>

    <template v-else>
      <div role="tablist" class="tabs tabs-boxed w-fit">
        <button type="button" role="tab" class="tab" :class="{ 'tab-active': activeTab === 'cards' }" @click="activeTab = 'cards'">Cards</button>
        <button type="button" role="tab" class="tab" :class="{ 'tab-active': activeTab === 'categories' }" @click="activeTab = 'categories'">Categories</button>
      </div>

      <template v-if="activeTab === 'cards'">

        <!-- 1. Cards this month -->
        <CardSpendWidget />

        <!-- 2. Credit card rows -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <CreditCardRow v-for="stats in cards.cardsWithStats" :key="stats.card.id" :stats="stats" @edit="startEdit" />
        </div>

        <!-- 3. Bandwidth -->
        <BandwidthWidget :showPerCard="true" />

        <!-- 4. Spending over time -->
        <div class="rounded-lg border border-base-300 bg-base-200 p-5">
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-display font-semibold">Total spending over time</h2>
            <p class="text-sm text-base-content/60">
              {{ thisMonth }}: <span class="font-mono tabular-nums font-medium">{{ formatCurrency(cards.totalForMonth(thisMonth)) }}</span>
            </p>
          </div>
          <CardSpendChart :history="cards.monthlyTotals" />
        </div>

      </template>

      <template v-else>
        <div class="flex items-center gap-2">
          <label class="text-sm text-base-content/60">Period</label>
          <select class="select select-bordered select-sm" v-model="scopeMonth">
            <option value="">All time</option>
            <option v-for="m in cards.loggedMonths" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div v-if="!collectiveBreakdown.length" class="rounded-lg border border-dashed border-base-300 p-10 text-center">
          <p class="text-base-content/70">No card spending logged for this period yet.</p>
        </div>

        <template v-else>
          <div class="rounded-lg border border-base-300 bg-base-200 p-5">
            <div class="flex items-baseline justify-between mb-3">
              <h2 class="font-display font-semibold">All cards combined</h2>
              <span class="font-mono tabular-nums font-medium text-sm">{{ formatCurrency(collectiveTotal) }}</span>
            </div>
            <CategoryBreakdownChart :breakdown="collectiveBreakdown" />
          </div>

          <div>
            <h2 class="font-display font-semibold mb-3">By card</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div
                v-for="{ card, breakdown } in cardsWithSpendInScope"
                :key="card.id"
                class="rounded-lg border border-base-300 bg-base-200 p-5"
              >
                <div class="flex items-baseline justify-between mb-3">
                  <h3 class="font-display font-semibold">{{ card.name }}</h3>
                  <span class="font-mono tabular-nums text-sm text-base-content/70">
                    {{ formatCurrency(breakdown.reduce((acc, c) => acc + c.amount, 0)) }}
                  </span>
                </div>
                <CategoryBreakdownChart :breakdown="breakdown" />
              </div>
            </div>
          </div>
        </template>
      </template>
    </template>

  </div>
</template>