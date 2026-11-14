import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../../src/model/defaults'
import { currentFilePath, setFilePath } from '../../src/io/documentPath'
import { useStore } from '../../src/store'

const saveFile = vi.hoisted(() => vi.fn(async () => true))
const saveToPath = vi.hoisted(() => vi.fn<(filePath: string, data: string) => Promise<boolean>>(async () => true))
const chooseSavePath = vi.hoisted(() => vi.fn(async () => null as string | null))

vi.mock('../../src/platform', () => ({
  getPlatform: () => ({
    isElectron: true,
    openFile: vi.fn(async () => null),
    saveFile,
    saveToPath,
    chooseSavePath,
  }),
}))

import { newProject, saveProject, saveProjectAs } from '../../src/ui/actions'

describe('save path', () => {
  beforeEach(() => {
    saveFile.mockClear()
    saveToPath.mockClear()
    chooseSavePath.mockReset()
    chooseSavePath.mockResolvedValue(null)
    setFilePath(null)
    useStore.getState().setProject(createProject('House', 'house'))
  })

  it('asks for a path on the first save and writes straight to it the next time', async () => {
    chooseSavePath.mockResolvedValue('/Users/me/Houses/house.nest')
    await saveProject()
    expect(chooseSavePath).toHaveBeenCalledTimes(1)
    expect(saveToPath).not.toHaveBeenCalled()
    expect(currentFilePath()).toBe('/Users/me/Houses/house.nest')

    await saveProject()
    expect(chooseSavePath).toHaveBeenCalledTimes(1)
    expect(saveToPath).toHaveBeenCalledTimes(1)
    expect(saveToPath.mock.calls[0]?.[0]).toBe('/Users/me/Houses/house.nest')
    expect(typeof saveToPath.mock.calls[0]?.[1]).toBe('string')
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('always asks on Save As and remembers the new path', async () => {
    setFilePath('/Users/me/Houses/house.nest')
    chooseSavePath.mockResolvedValue('/Users/me/Houses/copy.nest')
    await saveProjectAs()
    expect(chooseSavePath).toHaveBeenCalledTimes(1)
    expect(saveToPath).not.toHaveBeenCalled()
    expect(currentFilePath()).toBe('/Users/me/Houses/copy.nest')
  })

  it('clears the remembered path when a new project starts', async () => {
    chooseSavePath.mockResolvedValue('/Users/me/Houses/house.nest')
    await saveProject()
    expect(currentFilePath()).toBe('/Users/me/Houses/house.nest')
    newProject()
    expect(currentFilePath()).toBeNull()
    chooseSavePath.mockResolvedValue('/Users/me/Houses/fresh.nest')
    await saveProject()
    expect(saveToPath).not.toHaveBeenCalled()
    expect(chooseSavePath).toHaveBeenCalledTimes(2)
  })
})
