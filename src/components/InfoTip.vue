<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

defineProps({
  text: { type: String, required: true },
})

const open = ref(false)
const btn = ref(null)
const popoverStyle = ref({})

function position() {
  if (!btn.value) return
  const rect = btn.value.getBoundingClientRect()
  const GAP = 8
  popoverStyle.value = {
    position: 'fixed',
    // Centre horizontally on the button, but clamp so it stays on screen
    left: Math.min(
      Math.max(rect.left + rect.width / 2 - 128, 8),
      window.innerWidth - 264
    ) + 'px',
    top: rect.top - GAP + 'px',
    transform: 'translateY(-100%)',
    zIndex: 9999,
    width: '256px',
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    position()
  }
}

function onOutside(e) {
  if (btn.value && !btn.value.contains(e.target)) open.value = false
}

function onScroll() { if (open.value) position() }

onMounted(() => {
  document.addEventListener('mousedown', onOutside)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutside)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <span class="relative inline-flex items-center" ref="btn">
    <button
      type="button"
      class="text-base-content/30 hover:text-base-content/60 transition-colors leading-none"
      @click.stop="toggle"
      aria-label="More information"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01"/>
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          :style="popoverStyle"
          class="rounded-lg border border-base-300 bg-base-100 shadow-xl p-3 text-xs text-base-content/70 leading-relaxed"
        >
          {{ text }}
          <!-- Arrow pointing down -->
          <div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0"
               style="border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid oklch(var(--b3))">
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>