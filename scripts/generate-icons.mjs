#!/usr/bin/env node
// Run from repo root:
//   node scripts/generate-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

const svg = readFileSync('build/icons/helm-icon.svg')

// Linux requires a folder of PNGs named by size
const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]

for (const size of linuxSizes) {
  const dir = `build/icons/${size}x${size}`
  mkdirSync(dir, { recursive: true })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(`${dir}/icon.png`, png)
  console.log(`✓ ${dir}/icon.png`)
}

// Also write a flat 512px icon.png at build/icons/ root (fallback)
const png512 = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
writeFileSync('build/icons/icon.png', png512)
console.log('✓ build/icons/icon.png       (Linux fallback)')

// 1024px PNG for macOS
const png1024 = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
writeFileSync('build/icons/icon_1024.png', png1024)
console.log('✓ build/icons/icon_1024.png  (macOS)')

// ICO for Windows
const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, true)
writeFileSync('build/icons/icon.ico', ico)
console.log('✓ build/icons/icon.ico       (Windows)')

console.log('\nAll done. Commit build/icons/ to your repo.')