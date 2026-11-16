import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getEntry } from '../../src/catalog/registry'
import { addPhotoFurniture, bootImportedModels, catalogIdForAsset } from '../../src/io/importModel'
import { createProject } from '../../src/model/defaults'
import { useStore } from '../../src/store'

function fakeGlb(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nestwright-p3d-'))
  try {
    const out = path.join(dir, 'box.glb')
    execFileSync(path.join(process.cwd(), 'tests/fixtures/fake-photo3d.mjs'), ['--out', out, '/p/a.jpg'])
    return readFileSync(out).toString('base64')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 10))
}

describe('addPhotoFurniture', () => {
  it('stores a stretch-fitted GLB and places one item at the typed size in one undo step', async () => {
    useStore.getState().setProject(createProject('Blank', 'house'))
    bootImportedModels()
    const levelId = useStore.getState().activeLevelId
    const size = { w: 1.8, d: 0.9, h: 0.75 }
    const placed = addPhotoFurniture({ name: 'Sofa', data: fakeGlb(), size, levelId, position: { x: 3, y: 2 } })
    expect(placed).not.toBeNull()
    const state = useStore.getState()
    const asset = state.project.assets.find((item) => item.id === placed?.assetId)
    expect(asset).toMatchObject({ name: 'Sofa', format: 'glb', fit: 'stretch' })
    const level = state.project.levels.find((item) => item.id === levelId)
    const item = level?.items.find((entry) => entry.id === placed?.itemId)
    expect(item).toMatchObject({ catalogId: catalogIdForAsset(placed!.assetId), position: { x: 3, y: 2 }, size })
    // No material picks: the model keeps the colours baked from the photo.
    expect(item?.materials).toEqual({})
    expect(getEntry(catalogIdForAsset(placed!.assetId))?.materialSlots).toEqual({})
    expect(state.past.at(-1)?.label).toBe('Add furniture from photo')

    // When the GLB finishes loading, the typed size stays (an ordinary import would take the model's).
    await settle()
    expect(useStore.getState().past.at(-1)?.label).toBe('Model ready')
    const after = useStore.getState().project.levels.find((entry) => entry.id === levelId)?.items.find((entry) => entry.id === placed?.itemId)
    expect(after?.size).toEqual(size)
    expect(getEntry(catalogIdForAsset(placed!.assetId))?.defaultSize).toEqual(size)

    // Undo the load step and the add step: asset and item go together.
    while (useStore.getState().past.at(-1)?.label === 'Model ready') useStore.getState().undo()
    useStore.getState().undo()
    expect(useStore.getState().project.assets).toHaveLength(0)
    expect(useStore.getState().project.levels.flatMap((entry) => entry.items)).toHaveLength(0)
  })
})
