import * as THREE from 'three'
import { buildColumn } from '../../builders/columns'
import { buildRoof } from '../../builders/roofs'
import { buildSlab } from '../../builders/slabs'
import { buildStair } from '../../builders/stairs'
import type { Level, Project } from '../../model/types'
import { useStore } from '../../store'
import { registerSceneLayer, type SceneViewState } from '../layers'

registerSceneLayer({
  id: 'structure',
  create(ctx) {
    const root = new THREE.Group()
    root.name = 'structure'
    ctx.scene.add(root)
    const levelGroups = new Map<string, THREE.Group>()
    const builtFrom = new Map<string, Level>()
    const entities = new Map<string, LevelEntities>()
    return {
      sync(project: Project, state: SceneViewState) {
        const live = new Set(project.levels.map((level) => level.id))
        for (const [id, group] of levelGroups) {
          if (live.has(id)) continue
          root.remove(group)
          disposeGeometries(group)
          levelGroups.delete(id)
          builtFrom.delete(id)
          entities.delete(id)
        }
        for (const level of project.levels) {
          let group = levelGroups.get(level.id)
          if (!group) {
            group = new THREE.Group()
            levelGroups.set(level.id, group)
            root.add(group)
          }
          const prev = builtFrom.get(level.id)
          if (prev !== level) {
            let built = entities.get(level.id)
            if (!built) {
              built = { stairs: new Map(), columns: new Map(), slabs: new Map(), roofs: new Map() }
              entities.set(level.id, built)
            }
            sync(group, level, prev, built)
            builtFrom.set(level.id, level)
          }
          group.visible = levelVisible(project, level, state)
        }
      },
      update() {
        const show = useStore.getState().showRoofs
        root.traverse((obj) => {
          if (obj.userData.roof) obj.visible = show
        })
      },
      dispose() {
        ctx.scene.remove(root)
        disposeGeometries(root)
        levelGroups.clear()
        builtFrom.clear()
        entities.clear()
      },
    }
  },
})

type Built = Map<string, { source: object; object: THREE.Object3D }>

interface LevelEntities {
  stairs: Built
  columns: Built
  slabs: Built
  roofs: Built
}

/** Rebuilds only the stairs, columns, slabs and roofs whose source object changed. */
function sync(group: THREE.Group, level: Level, prev: Level | undefined, built: LevelEntities) {
  // Every builder reads the level (elevation, height); roofs also follow its walls (eaves, outline).
  const levelMoved = !prev || prev.elevation !== level.elevation || prev.height !== level.height
  const wallsMoved = levelMoved || prev.walls !== level.walls
  syncKind(group, built.stairs, level.stairs, levelMoved, (stair) => buildStair(stair, level))
  syncKind(group, built.columns, level.columns, levelMoved, (column) => buildColumn(column, level))
  syncKind(group, built.slabs, level.slabs, levelMoved, (slab) => buildSlab(slab, level))
  syncKind(group, built.roofs, level.roofs, wallsMoved, (roof) => buildRoof(roof, level))
}

function syncKind<T extends { id: string }>(
  group: THREE.Group,
  built: Built,
  sources: readonly T[],
  force: boolean,
  build: (source: T) => THREE.Object3D,
) {
  const seen = new Set<string>()
  for (const source of sources) {
    seen.add(source.id)
    const prev = built.get(source.id)
    if (prev && prev.source === source && !force) continue
    if (prev) {
      group.remove(prev.object)
      disposeGeometries(prev.object)
      built.delete(source.id)
    }
    try {
      const object = build(source)
      group.add(object)
      built.set(source.id, { source, object })
    } catch (err) {
      console.error(err)
    }
  }
  for (const [id, prev] of built) {
    if (seen.has(id)) continue
    group.remove(prev.object)
    disposeGeometries(prev.object)
    built.delete(id)
  }
}

function levelVisible(project: Project, level: Level, state: SceneViewState): boolean {
  const active = project.levels.find((item) => item.id === state.activeLevelId)
  const elev = active?.elevation ?? 0
  const above = level.elevation > elev + 1e-3
  if (state.levelDisplay !== 'all' && above) return false
  if (state.levelDisplay === 'current' && level.id !== state.activeLevelId) return false
  return true
}

function disposeGeometries(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
  })
}
