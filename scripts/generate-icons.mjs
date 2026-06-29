#!/usr/bin/env node
// Run from repo root:
//   node scripts/generate-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import sharp from 'sharp'
import png2icons from 'png2icons'

const svgBuffer = readFileSync('build/icons/helm-icon.svg')

// Linux — 512px PNG (electron-builder reads dimensions from PNG headers)
mkdirSync('build/icons', { recursive: true })
await sharp(svgBuffer).resize(512, 512).png().toFile('build/icons/icon.png')
console.log('✓ build/icons/icon.png (Linux 512px)')

// macOS — 1024px PNG
mkdirSync('build/icons/mac', { recursive: true })
await sharp(svgBuffer).resize(1024, 1024).png().toFile('build/icons/mac/icon.png')
console.log('✓ build/icons/mac/icon.png (macOS 1024px)')

// Windows — ICO built from 1024px PNG
const png1024 = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer()
const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, true)
writeFileSync('build/icons/icon.ico', ico)
console.log('✓ build/icons/icon.ico (Windows)')

console.log('\nDone.')