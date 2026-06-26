import { ref } from 'vue'

const toasts = ref([])
let nextId = 1

function show(message, type = 'success', duration = 3000) {
  const id = nextId++
  toasts.value.push({ id, message, type })
  setTimeout(() => dismiss(id), duration)
}

function dismiss(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

export function useToast() {
  return {
    toasts,
    success: (message, duration)        => show(message, 'success', duration),
    error:   (message, duration = 5000) => show(message, 'error',   duration),
    info:    (message, duration)        => show(message, 'info',     duration),
    dismiss,
  }
}