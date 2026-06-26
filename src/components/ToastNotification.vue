<script setup>
import { useToast } from '../composables/useToast'
const toast = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      <TransitionGroup
        tag="div"
        class="flex flex-col gap-2 items-end"
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-2 scale-95"
      >
        <div
          v-for="t in toast.toasts.value"
          :key="t.id"
          class="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-lg border text-sm font-medium max-w-xs"
          :class="{
            'bg-success/10 border-success/30 text-success':     t.type === 'success',
            'bg-error/10  border-error/30  text-error':         t.type === 'error',
            'bg-info/10   border-info/30   text-info':          t.type === 'info',
          }"
        >
          <!-- Icon -->
          <svg v-if="t.type === 'success'" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          <svg v-else-if="t.type === 'error'" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01"/>
          </svg>

          {{ t.message }}

          <button
            type="button"
            class="ml-1 opacity-50 hover:opacity-100 transition-opacity"
            @click="toast.dismiss(t.id)"
          >✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>