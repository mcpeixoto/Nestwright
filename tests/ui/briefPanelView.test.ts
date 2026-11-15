import { describe, expect, it } from 'vitest'
import { briefById, scoreBrief, type BriefResult } from '../../src/model/briefs'
import { createProject } from '../../src/model/defaults'
import { briefPanelView } from '../../src/ui/briefs/view'

describe('briefPanelView', () => {
  it('turns checks into rows and keeps the star count', () => {
    const result: BriefResult = {
      stars: 2,
      checks: [
        {
          id: 'room:bedroom',
          ok: true,
          label: { en: 'Bedroom', pt: 'Quarto' },
          detail: { en: '1 bedroom in the house.', pt: '1 quarto na casa.' },
        },
        {
          id: 'budget',
          ok: false,
          label: { en: 'Within the budget', pt: 'Dentro do orçamento' },
        },
      ],
    }
    expect(briefPanelView(result, 'en')).toEqual({
      stars: 2,
      rows: [
        { id: 'room:bedroom', ok: true, mark: '✓', label: 'Bedroom', detail: '1 bedroom in the house.' },
        { id: 'budget', ok: false, mark: '✗', label: 'Within the budget', detail: '' },
      ],
    })
    const portuguese = briefPanelView(result, 'pt-PT')
    expect(portuguese.rows[0]).toMatchObject({ label: 'Quarto', detail: '1 quarto na casa.' })
    expect(portuguese.stars).toBe(2)
  })

  it('follows a real score without dropping checks', () => {
    const brief = briefById('starter-flat-for-two')
    if (!brief) throw new Error('missing brief')
    const scored = scoreBrief(createProject('Empty', 'house'), brief)
    const view = briefPanelView(scored, 'en')
    expect(view.stars).toBe(scored.stars)
    expect(view.rows.map((row) => row.id)).toEqual(scored.checks.map((check) => check.id))
    expect(view.rows.every((row, index) => row.ok === scored.checks[index]?.ok && row.mark === (row.ok ? '✓' : '✗'))).toBe(true)
    expect(view.rows[0]?.label).toBe(scored.checks[0]?.label.en)
  })
})
