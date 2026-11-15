import { describe, expect, it } from 'vitest'
import { budgetCsv } from '../../src/io/export/budgetCsv'
import type { BudgetCategory, BudgetEstimate, BudgetLine } from '../../src/model/budget'
import { createProject } from '../../src/model/defaults'

function categories(partial: Partial<Record<BudgetCategory, number>> = {}): Record<BudgetCategory, number> {
  return {
    construction: 0,
    finishes: 0,
    openings: 0,
    items: 0,
    terrain: 0,
    labour: 0,
    fees: 0,
    other: 0,
    ...partial,
  }
}

function line(partial: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id: 'items:sofa',
    category: 'items',
    roomKey: 'kitchen',
    roomName: 'Kitchen',
    label: 'Sofa',
    quantity: 1,
    unitPrice: 10,
    amount: 10,
    source: 'catalog',
    ...partial,
  }
}

function estimate(lines: BudgetLine[], total: number): BudgetEstimate {
  return {
    currency: 'EUR',
    total,
    byCategory: categories({ items: total }),
    byRoom: [],
    lines,
    target: null,
    delta: null,
  }
}

/** Minimal RFC 4180 reader so a quoted comma cannot masquerade as a column break. */
function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === sep) {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

describe('budgetCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    const project = createProject('Csv', 'house')
    const csv = budgetCsv(
      estimate(
        [
          line({
            roomName: 'Kitchen, "west"\nwing',
            label: 'Sofa, "linen"',
          }),
        ],
        10,
      ),
      project,
      'en',
    )
    const rows = parseCsv(csv, ',')
    expect(rows[1]?.[1]).toBe('Kitchen, "west"\nwing')
    expect(rows[1]?.[2]).toBe('Sofa, "linen"')
    expect(csv).toContain('"Kitchen, ""west""')
    expect(csv).toContain('"Sofa, ""linen"""')
  })

  it('writes pt-PT with semicolons, a decimal comma and Portuguese headers', () => {
    const project = createProject('Csv', 'house')
    const data = estimate([line({ label: 'Sofa', amount: 12.5, unitPrice: 12.5 })], 12.5)
    const ptRows = budgetCsv(data, project, 'pt-PT').split(/\r?\n/)
    const enRows = budgetCsv(data, project, 'en').split(/\r?\n/)
    expect(ptRows[0]?.split(';')).toHaveLength(7)
    expect(ptRows[0]).not.toContain('Category')
    expect(enRows[0]?.split(',')).toEqual(['Category', 'Room', 'Item', 'Quantity', 'Unit price', 'Total', 'Source'])
    expect(ptRows[1]).toContain('12,5')
    expect(enRows[1]).toContain('12.5')
  })

  it('writes a totals row equal to the estimate total', () => {
    const project = createProject('Csv', 'house')
    const csv = budgetCsv(estimate([line({ amount: 10, unitPrice: 10 })], 42), project, 'en')
    const rows = parseCsv(csv, ',')
    const header = rows[0] ?? []
    const totalIndex = header.indexOf('Total')
    const last = rows[rows.length - 1] ?? []
    expect(last[0]).toBe('Total')
    expect(Number(last[totalIndex])).toBe(42)
  })
})
