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
    return {
      sync(project: Project, state: SceneViewState) {
        const live = new Set(project.levels.map((level) => level.id))
        for (const [id, group] of levelGroups) {
          if (live.has(id)) continue
          root.remove(group)
          disposeGeometries(group)
          levelGroups.delete(id)
          builtFrom.delete(id)
        }
        for (const level of project.levels) {
          let group = levelGroups.get(level.id)
          if (!group) {
            group = new THREE.Group()
            levelGroups.set(level.id, group)
            root.add(group)
          }
          if (builtFrom.get(level.id) !== level) {
            rebuild(group, level)
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
      },
    }
  },
})

function rebuild(group: THREE.Group, level: Level) {
  for (const child of [...group.children]) {
    group.remove(child)
    disposeGeometries(child)
  }
  try {
    for (const stair of level.stairs) group.add(buildStair(stair, level))
    for (const column of level.columns) group.add(buildColumn(column, level))
    for (const slab of level.slabs) group.add(buildSlab(slab, level))
    for (const roof of level.roofs) group.add(buildRoof(roof, level))
  } catch (err) {
    console.error(err)
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
