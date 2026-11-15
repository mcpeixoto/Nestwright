import { describe, expect, it } from 'vitest'
import { migrate } from '../../src/io/migrate'
import { deserialize, serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'

describe('optional project brief', () => {
  it('loads a project that has no brief through migrate', () => {
    const project = createProject('Older file', 'house')
    const raw = JSON.parse(serialize(project)) as Record<string, unknown>
    delete raw.brief
    const migrated = migrate(raw) as { brief?: unknown; name?: unknown; levels?: unknown }
    expect(migrated.brief).toBeUndefined()
    expect(migrated.name).toBe('Older file')
    const loaded = deserialize(JSON.stringify(raw))
    expect(loaded.brief).toBeUndefined()
    expect(loaded.name).toBe('Older file')
    expect(loaded.levels.length).toBeGreaterThan(0)
  })

  it('keeps a brief id that is already on the file', () => {
    const project = createProject('Brief', 'house')
    const raw = JSON.parse(serialize(project)) as Record<string, unknown>
    raw.brief = { id: 'starter-flat-for-two' }
    const migrated = migrate(raw) as { brief?: { id: string } }
    expect(migrated.brief).toEqual({ id: 'starter-flat-for-two' })
    expect(deserialize(JSON.stringify(raw)).brief).toEqual({ id: 'starter-flat-for-two' })
  })
})
