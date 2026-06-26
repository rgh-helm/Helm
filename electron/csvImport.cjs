// Parses a credit-card transaction export CSV and summarizes spend by
// category. Built for Apple Card's export format (Transaction Date,
// Clearing Date, Description, Merchant, Category, Type, Amount (USD),
// Purchased By) but column lookup is name-based and tolerant of minor
// variations, so it'll work for any export with recognizable Amount/
// Category/Type columns rather than failing outright on other cards.

// Hand-rolled rather than a dependency: handles quoted fields (including
// embedded commas and escaped "" quotes) and both \n and \r\n line endings,
// which covers this format without pulling in a CSV library for one
// small, well-defined parsing job.
function parseCsvText(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // skip — the following \n (if present) ends the row
    } else {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  // Drop fully-blank trailing rows (common at end of file).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function findColumn(headers, candidates) {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate)
    if (idx !== -1) return idx
  }
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate))
    if (idx !== -1) return idx
  }
  return -1
}

// Row types that represent the cardholder paying down the balance, not
// spend — excluded from the total and category breakdown.
const NON_SPEND_TYPES = new Set(['payment'])

function parseCardCsv(text) {
  const rows = parseCsvText(text)
  if (!rows.length) {
    throw new Error('This CSV file is empty.')
  }

  const headers = rows[0]
  const amountIdx = findColumn(headers, ['amount (usd)', 'amount'])
  const categoryIdx = findColumn(headers, ['category'])
  const typeIdx = findColumn(headers, ['type'])

  if (amountIdx === -1) {
    throw new Error('Could not find an "Amount" column in this CSV.')
  }

  const byCategory = new Map()
  let total = 0
  let transactionCount = 0
  let skippedPayments = 0

  for (const row of rows.slice(1)) {
    const amount = parseFloat(row[amountIdx])
    if (Number.isNaN(amount)) continue

    const type = typeIdx !== -1 ? (row[typeIdx] || '').trim().toLowerCase() : ''
    if (NON_SPEND_TYPES.has(type)) {
      skippedPayments++
      continue
    }

    const category = categoryIdx !== -1 ? (row[categoryIdx] || '').trim() || 'Uncategorized' : 'Uncategorized'
    byCategory.set(category, (byCategory.get(category) || 0) + amount)
    total += amount
    transactionCount++
  }

  const categories = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)

  return {
    total: Math.round(total * 100) / 100,
    categories,
    transactionCount,
    skippedPayments,
  }
}

module.exports = { parseCardCsv, parseCsvText }