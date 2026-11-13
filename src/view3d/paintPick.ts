import { getEntry } from '../catalog/registry'
import { perp, sub } from '../model/geometry'
import { paintLevel, readMaterial, type PaintTarget } from '../model/paint'
import type { Wall } from '../model/types'
import { useStore } from '../store'
import { eyedropMaterial, paintBrush } from '../tools/paint'
import type * as THREE from 'three'

export interface ViewHit {
  object: THREE.Object3D
  normal: THREE.Vector3 | null
}

function sideOf(wall: Wall, face: string, normal: THREE.Vector3 | null): 'left' | 'right' {
  if (face === 'left' || face === 'right') return face
  if (!normal) return 'left'
  const dir = sub(wall.b, wall.a)
  const length = Math.hypot(dir.x, dir.y) || 1
  const left = perp({ x: dir.x / length, y: dir.y / length })
  return normal.x * left.x + normal.z * left.y >= 0 ? 'left' : 'right'
}

function targetFromHit(hit: ViewHit, levelId: string, shift: boolean): PaintTarget | null {
  let slot = ''
  let node: THREE.Object3D | null = hit.object
  let id = ''
  let kind = ''
  let face = ''
  let ceiling = false
  let roof = false
  while (node) {
    if (!slot && typeof node.userData.slot === 'string') slot = node.userData.slot
    if (!face && typeof node.userData.face === 'string') face = node.userData.face
    if (node.userData.ceiling) ceiling = true
    if (node.userData.roof) roof = true
    if (!id && typeof node.userData.entityId === 'string') {
      id = node.userData.entityId
      kind = String(node.userData.kind ?? '')
    }
    node = node.parent
  }
  if (!id || kind === 'opening') return null
  const level = useStore.getState().project.levels.find((entry) => entry.id === levelId)
  if (!level) return null
  if (kind === 'wall') {
    const wall = level.walls.find((entry) => entry.id === id)
    if (!wall) return null
    return { kind: 'wall', id, side: sideOf(wall, face, hit.normal) }
  }
  if (kind === 'room') return { kind: ceiling || shift ? 'ceiling' : 'floor', key: id }
  if (kind === 'roof' || roof) return { kind: 'roof', id }
  if (kind === 'item') {
    const item = level.items.find((entry) => entry.id === id)
    if (!item) return null
    const entry = getEntry(item.catalogId)
    const resolved = slot || Object.keys(item.materials)[0] || Object.keys(entry?.materialSlots ?? {})[0] || 'body'
    return { kind: 'item', id, slot: resolved }
  }
  return null
}

export function paintFromHits(levelId: string, hits: readonly ViewHit[], eyedrop: boolean, shift: boolean): void {
  let target: PaintTarget | null = null
  for (const hit of hits) {
    target = targetFromHit(hit, levelId, shift)
    if (target) break
  }
  if (!target) return
  const state = useStore.getState()
  const level = state.project.levels.find((entry) => entry.id === levelId)
  if (!level) return
  if (eyedrop) {
    const material = readMaterial(level, target)
    if (material) eyedropMaterial(material)
    return
  }
  const material = paintBrush()
  state.apply('Paint', (draft) => {
    const found = draft.levels.find((entry) => entry.id === levelId)
    if (found && target) paintLevel(found, target, material)
  })
}
