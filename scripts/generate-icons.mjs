#!/usr/bin/env node
// Run this once from your repo root:
//   node scripts/generate-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

mkdirSync('build/icons', { recursive: true })

const svg = readFileSync('build/icons/helm-icon.svg')

// 1024px PNG — used by macOS electron-builder and as source for everything else
const png1024 = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
writeFileSync('build/icons/icon_1024.png', png1024)
console.log('✓ build/icons/icon_1024.png  (macOS)')

// 512px PNG — Linux
const png512 = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
writeFileSync('build/icons/icon.png', png512)
console.log('✓ build/icons/icon.png       (Linux)')

// ICO — Windows (contains 16, 32, 48, 256 internally)
const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, true)
writeFileSync('build/icons/icon.ico', ico)
console.log('✓ build/icons/icon.ico       (Windows)')

console.log('\nAll done. Commit build/icons/ to your repo.')