<template>
  <canvas ref="canvasRef" class="nautical-bg" aria-hidden="true" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
let raf = null
let driftOffset = 0

const LINE_COUNT = 25
const LINE_OPACITY = 0.13
const DRIFT_SPEED = 7

function getLineColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'helm-dark'
  return isDark ? '77,143,214' : '30,80,160'
}

function resize(canvas) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
}

function drawContours(ctx, W, H, t, lineRgb, opacity, count) {
  const spacing = H / (count + 1)
  ctx.lineWidth = 1

  for (let i = 0; i < count; i++) {
    const baseY = (i + 1) * spacing
    ctx.beginPath()
    ctx.strokeStyle = `rgba(${lineRgb},${opacity})`

    const segs = 80
    for (let s = 0; s <= segs; s++) {
      const x = (s / segs) * W
      const nx = s / segs  // 0..1 across screen

      // Two overlapping sine waves per line, each with unique phase
      const waveA = Math.sin(nx * Math.PI * 2.5 + i * 1.1 + t * 0.4) * spacing * 0.22
      const waveB = Math.sin(nx * Math.PI * 1.3 - i * 0.7 + t * 0.25) * spacing * 0.10

      const y = baseY + waveA + waveB

      if (s === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.stroke()
  }
}

function draw(canvas) {
  if (document.hidden) {
    raf = requestAnimationFrame(() => draw(canvas))
    return
  }

  const ctx = canvas.getContext('2d')
  const W = window.innerWidth
  const H = window.innerHeight

  ctx.clearRect(0, 0, W, H)
  drawContours(ctx, W, H, driftOffset, getLineColor(), LINE_OPACITY, LINE_COUNT)

  driftOffset += DRIFT_SPEED * 0.003
  raf = requestAnimationFrame(() => draw(canvas))
}

function onResize() {
  const canvas = canvasRef.value
  if (!canvas) return
  cancelAnimationFrame(raf)
  resize(canvas)
  draw(canvas)
}

onMounted(() => {
  const canvas = canvasRef.value
  resize(canvas)
  draw(canvas)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) draw(canvas)
  })
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.nautical-bg {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}
</style>