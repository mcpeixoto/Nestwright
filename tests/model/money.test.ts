import { describe, expect, it } from 'vitest'
import { formatMoney } from '../../src/model/money'

describe('formatMoney', () => {
  it('groups thousands for the locale', () => {
    expect(formatMoney(12500, 'EUR', 'en')).toMatch(/12[,.]500/)
    expect(formatMoney(12500, 'EUR', 'pt-PT')).toMatch(/12[\s.\u00a0]500/)
    expect(formatMoney(Number.NaN, 'nope', 'en')).toMatch(/EUR|€/)
  })
})
