import { beforeEach, describe, expect, it } from 'vitest'
import { isDirty, markSaved } from '../../src/io/dirty'
import { createProject } from '../../src/model/defaults'
import { useStore } from '../../src/store'

describe('unsaved changes', () => {
  beforeEach(() => {
    useStore.getState().setProject(createProject('Saved', 'house'))
    markSaved()
  })

  it('becomes dirty when an edit changes the project', () => {
    expect(isDirty()).toBe(false)
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'Edited'
    })
    expect(isDirty()).toBe(true)
    expect(useStore.getState().project.name).toBe('Edited')
  })

  it('clears after the document is marked saved', () => {
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'Edited'
    })
    expect(isDirty()).toBe(true)
    markSaved()
    expect(isDirty()).toBe(false)
  })

  it('stays dirty after undo', () => {
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'Edited'
    })
    useStore.getState().undo()
    expect(useStore.getState().project.name).toBe('Saved')
    expect(isDirty()).toBe(true)
  })
})
