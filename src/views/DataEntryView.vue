<script setup>
import { computed, ref, nextTick } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import SnapshotForm from '../components/SnapshotForm.vue'
import CashFlowTimeline from '../components/CashFlowTimeline.vue'
import ScenarioSandbox  from '../components/ScenarioSandbox.vue'
import VariableSpendingWidget from '../components/VariableSpendingWidget.vue'
import { currentMonthKey, shiftMonthKey } from '../utils/format'
import { formatMonthLong } from '../utils/format'

const finance = useFinanceStore()

const currentMonth   = currentMonthKey()
const selectedMonth  = ref(currentMonth)
const showSandbox    = ref(false)
const pickingMonth   = ref(false)
const monthInputRef  = ref(null)

const editingSnapshot = computed(() =>
  finance.sortedSnapshots.find((s) => s.month === selectedMonth.value) ?? null
)
const isCurrentMonth = computed(() => selectedMonth.value === currentMonth)

function prevMonth() { selectedMonth.value = shiftMonthKey(selectedMonth.value, -1) }
function nextMonth() { selectedMonth.value = shiftMonthKey(selectedMonth.value, 1)  }
function goToToday() { selectedMonth.value = currentMonth }

function openPicker() {
  pickingMonth.value = true
  nextTick(() => monthInputRef.value?.focus())
}

function onMonthPick(e) {
  if (e.target.value) selectedMonth.value = e.target.value
  pickingMonth.value = false
}
</script>

<template>
  <div class="space-y-6">

    <!-- ── Month navigation ── -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-display text-2xl font-semibold">Monthly Entry</h1>
        <p class="text-sm text-base-content/60">
          Log this month's numbers. Saving again for the same month updates that entry.
        </p>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <!-- Shown only when not already on the current month -->
        <button
          v-if="!isCurrentMonth"
          type="button"
          class="btn btn-ghost btn-xs mr-1 text-primary"
          title="Jump back to the current month"
          @click="goToToday"
        >Today</button>

        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          title="Previous month"
          @click="prevMonth"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        <!-- Clicking the label opens a native month picker to jump anywhere -->
        <div class="relative min-w-[160px] text-center">
          <span
            v-if="!pickingMonth"
            class="font-display font-semibold text-lg px-2 cursor-pointer hover:text-primary transition-colors"
            title="Click to jump to any month"
            @click="openPicker"
          >{{ formatMonthLong(selectedMonth) }}</span>

          <input
            v-else
            ref="monthInputRef"
            type="month"
            class="input input-sm input-bordered w-full"
            :value="selectedMonth"
            @change="onMonthPick"
            @blur="pickingMonth = false"
            @keydown.escape="pickingMonth = false"
          />
        </div>

        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          title="Next month"
          @click="nextMonth"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Timeline / Sandbox toggle -->
    <div class="flex rounded-lg border border-base-300 bg-base-200/60 overflow-hidden">
      <button
        class="flex-1 py-1.5 text-xs font-medium transition-colors"
        :class="!showSandbox ? 'bg-base-100 text-base-content' : 'text-base-content/50 hover:text-base-content/70'"
        @click="showSandbox = false">
        Cash Flow Timeline
      </button>
      <button
        class="flex-1 py-1.5 text-xs font-medium transition-colors"
        :class="showSandbox ? 'bg-base-100 text-base-content' : 'text-base-content/50 hover:text-base-content/70'"
        @click="showSandbox = true">
        Forecast Sandbox
      </button>
    </div>
    <CashFlowTimeline v-if="!showSandbox" :month="selectedMonth" />
    <ScenarioSandbox  v-else              :month="selectedMonth" />

    <VariableSpendingWidget :month="selectedMonth" />

    <SnapshotForm
      :initial="editingSnapshot"
      :month="selectedMonth"
      :showMonthPicker="false"
    />

  </div>
</template>