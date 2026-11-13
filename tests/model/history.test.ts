import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/model/defaults'
import { useStore } from '../../src/store'

describe('undo and redo', () => {
  it('round-trips a change and coalesces a drag into one step', () => {
    const blank = createProject('Blank', 'house')
    useStore.getState().setProject(blank)
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'First'
    })
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'Second'
    })
    expect(useStore.getState().project.name).toBe('Second')
    expect(useStore.getState().past).toHaveLength(1)
    useStore.getState().undo()
    expect(useStore.getState().project.name).toBe('Blank')
    expect(useStore.getState().canUndo).toBe(false)
    expect(useStore.getState().canRedo).toBe(true)
    useStore.getState().redo()
    expect(useStore.getState().project.name).toBe('Second')

    useStore.getState().apply('Other', (draft) => {
      draft.name = 'Third'
    })
    useStore.getState().undo()
    expect(useStore.getState().project.name).toBe('Second')
  })

  it('applies remote patches without recording local history', () => {
    useStore.getState().setProject(createProject('Remote', 'house'))
    const seen: number[] = []
    const stop = useStore.getState().subscribePatches((patches) => seen.push(patches.length))
    useStore.getState().apply('Rename', (draft) => {
      draft.name = 'Local'
    })
    const patches = useStore.getState().past[0]?.patches ?? []
    useStore.getState().undo()
    const pastBefore = useStore.getState().past.length
    useStore.getState().applyRemotePatches(patches)
    expect(useStore.getState().project.name).toBe('Local')
    expect(useStore.getState().past.length).toBe(pastBefore)
    // The local edit and its undo both publish, so a partner sees the undo. Remote apply stays silent.
    expect(seen.length).toBe(2)
    stop()
  })

  it('drops an undo that no longer applies and says why', () => {
    useStore.getState().setProject(createProject('Undo', 'house'))
    useStore.getState().apply('Note', (draft) => {
      draft.wishes.push({
        id: 'w1',
        author: 'Ada',
        target: { kind: 'point', levelId: draft.levels[0]?.id ?? '', at: { x: 1, y: 1 } },
        reaction: 'love',
        note: 'Window',
        createdAt: 1,
      })
    })
    useStore.getState().applyRemotePatches([{ op: 'remove', path: ['wishes'] }])
    useStore.getState().undo()
    expect(useStore.getState().message).toBe("Partner changed this — can't undo")
    expect(useStore.getState().canUndo).toBe(false)
    expect(useStore.getState().project.wishes).toBeUndefined()
  })
})
