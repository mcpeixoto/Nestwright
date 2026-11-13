import { describe, expect, it } from 'vitest'
import { railIconTool } from '../../src/ui/railDefaults'

const build = [{ id: 'stair' }, { id: 'wall' }, { id: 'pan' }]

describe('rail defaults', () => {
  it('shows Wall for a fresh Build group even when Stair is listed first', () => {
    expect(railIconTool(build, 'build', 'select', undefined)?.id).toBe('wall')
  })

  it('uses the remembered tool only after one was chosen in the group', () => {
    expect(railIconTool(build, 'build', 'select', 'stair')?.id).toBe('stair')
    expect(railIconTool([{ id: 'door' }, { id: 'window' }], 'openings', 'select', undefined)?.id).toBe('door')
    expect(railIconTool([{ id: 'paint' }, { id: 'place' }], 'interior', 'select', undefined)?.id).toBe('paint')
  })
})
