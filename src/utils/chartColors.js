// Cycles through the app's theme palette so charts stay visually
// consistent with the rest of the UI rather than chart.js defaults.
export const CATEGORY_PALETTE = [
  '#1B4332', // primary
  '#C99A3B', // secondary
  '#3A6E5A', // accent
  '#3A6EA5', // info
  '#C77B26', // warning
  '#2F7D52', // success
  '#B3402F', // error
  '#6B5B95',
]

// Deterministic color per category name (a stable hash into the palette,
// not array position) — so "Groceries" is always the same color whether
// it's first or third in a given chart's sort order, and stays consistent
// across different charts (a doughnut sorted by amount, a trend chart
// sorted by all-time total, a per-card breakdown, etc.). Repeats once
// there are more distinct categories than palette colors, which is fine —
// legends and tooltips still disambiguate by label.
//
// `categories` (optional) is the managed list from Settings → Categories —
// if the matching category has a manually-picked color, that wins; the
// hash is only a fallback for categories that were never explicitly
// colored (including ad hoc ones typed in that aren't in the managed list
// at all, like "Other").
export function categoryColor(category, categories = []) {
  const manual = categories.find((c) => c.name === category)?.color
  if (manual) return manual

  const str = String(category || '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length]
}