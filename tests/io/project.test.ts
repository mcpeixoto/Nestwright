import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'

describe('project files', () => {
  it('round-trips a project', () => {
    const project = createProject('Round trip', 'house')
    const level = project.levels[0]
    if (!level) throw new Error('expected a level')
    addWallChain(level, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 0 },
    ])
    const back = deserialize(serialize(project))
    expect(back.name).toBe('Round trip')
    expect(back.version).toBe(1)
    expect(back.levels[0]?.walls).toHaveLength(project.levels[0]?.walls.length ?? 0)
    expect(back.budget.currency).toBe('EUR')
    expect(back.environment.dayOfYear).toBe(172)
  })

  it('rejects an invalid file with a clear error', () => {
    expect(() => deserialize('not json')).toThrow(/invalid JSON/i)
    expect(() => deserialize('{}')).toThrow(/version/i)
    expect(() => deserialize(JSON.stringify({ version: 99 }))).toThrow(/newer/)
    expect(() => deserialize(JSON.stringify({ version: 1, name: 'x' }))).toThrow(/kind|level|missing/i)
  })
})
