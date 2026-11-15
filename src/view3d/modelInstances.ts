import * as THREE from 'three'
import { releaseModelGeometry, retainModelGeometry, type ModelInfo } from '../catalog/models'
import { wantsLowLod } from '../model/modelFit'

/**
 * Draws a level's scanned furniture. Items with the same model at the same fit (four dining
 * chairs) become one InstancedMesh per model part and LOD instead of one draw each; the
 * per-item meshes stay in the scene, hidden, so picking, the selection box, the gizmo and
 * the walk rig keep finding the item they belong to. Every model also switches to its LOD1
 * beyond `wantsLowLod` distance.
 */

interface Member {
  id: string
  model: THREE.Object3D
  info: ModelInfo
  /** Model space → the instancer's parent. */
  matrix: THREE.Matrix4
  world: THREE.Vector3
}

interface Batch {
  members: Member[]
  /** One InstancedMesh per part, per LOD. */
  lods: THREE.InstancedMesh[][]
  /** Which members were far at the last split (bitmask as a string). */
  split: string
}

const LOD_EVERY_FRAMES = 6

function modelOf(object: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  object.traverse((child) => {
    if (!found && child.userData.model) found = child
  })
  return found
}

function lodGroups(model: THREE.Object3D): THREE.Object3D[] {
  return model.children.filter((child) => typeof child.userData.lod === 'number')
}

/** The lit, shadowed InstancedMesh for one part of one LOD. */
function instancedFor(source: THREE.Mesh, count: number, ids: string[]): THREE.InstancedMesh {
  retainModelGeometry(source.geometry)
  const mesh = new THREE.InstancedMesh(source.geometry, source.material, count)
  mesh.name = source.name
  mesh.castShadow = source.castShadow
  mesh.receiveShadow = source.receiveShadow
  mesh.renderOrder = source.renderOrder
  mesh.userData.kind = 'item'
  mesh.userData.instanceIds = ids
  mesh.userData.modelInstances = true
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  return mesh
}

export class ModelInstancer {
  private batches: Batch[] = []
  private singles: Member[] = []
  private frame = 0
  dirty = true

  constructor(private readonly parent: THREE.Object3D) {}

  /** Re-group from the item objects now in the scene. */
  rebuild(items: Iterable<{ id: string; object: THREE.Object3D }>): void {
    this.clear()
    this.dirty = false
    this.parent.updateMatrixWorld(true)
    const inverse = this.parent.matrixWorld.clone().invert()
    const groups = new Map<string, Member[]>()
    for (const { id, object } of items) {
      const model = modelOf(object)
      if (!model) continue
      model.visible = true
      const info = model.userData.model as ModelInfo
      const first = lodGroups(model)[0]
      if (!first) continue
      const matrix = inverse.clone().multiply(first.matrixWorld)
      const member: Member = { id, model, info, matrix, world: new THREE.Vector3().setFromMatrixPosition(first.matrixWorld) }
      // Lamps glow and switch one by one, so each keeps its own materials and draws.
      if (info.lamp) {
        this.singles.push(member)
        continue
      }
      const list = groups.get(info.instanceKey)
      if (list) list.push(member)
      else groups.set(info.instanceKey, [member])
    }
    for (const members of groups.values()) {
      if (members.length < 2) {
        this.singles.push(...members)
        continue
      }
      const sample = members[0]!.model
      const lods: THREE.InstancedMesh[][] = []
      for (const group of lodGroups(sample)) {
        const meshes: THREE.InstancedMesh[] = []
        for (const child of group.children) {
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh) continue
          const instanced = instancedFor(mesh, members.length, members.map((m) => m.id))
          this.parent.add(instanced)
          meshes.push(instanced)
        }
        lods.push(meshes)
      }
      for (const member of members) member.model.visible = false
      this.batches.push({ members, lods, split: '' })
    }
    this.frame = 0
  }

  /** Pick each model's LOD from the camera; cheap, and only touches GPU data on a change. */
  update(camera: THREE.Camera, force = false): void {
    if (!force && this.frame++ % LOD_EVERY_FRAMES !== 0) return
    const eye = camera.getWorldPosition(new THREE.Vector3())
    for (const member of this.singles) {
      const far = wantsLowLod(eye.distanceTo(member.world), member.info.radius)
      const groups = lodGroups(member.model)
      if (groups.length < 2) continue
      groups[0]!.visible = !far
      groups[1]!.visible = far
    }
    for (const batch of this.batches) this.split(batch, eye)
  }

  private split(batch: Batch, eye: THREE.Vector3): void {
    const far = batch.members.map((member) => batch.lods.length > 1 && wantsLowLod(eye.distanceTo(member.world), member.info.radius))
    const key = far.map((f) => (f ? 1 : 0)).join('')
    if (key === batch.split) return
    batch.split = key
    batch.lods.forEach((meshes, lod) => {
      const chosen = batch.members.filter((_, i) => (lod === 1 ? far[i] : !far[i]))
      const ids = chosen.map((member) => member.id)
      for (const mesh of meshes) {
        chosen.forEach((member, i) => mesh.setMatrixAt(i, member.matrix))
        mesh.count = chosen.length
        mesh.visible = chosen.length > 0
        mesh.userData.instanceIds = ids
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        mesh.computeBoundingBox()
        const radius = batch.members[0]?.info.radius ?? 0.5
        mesh.userData.probeRadius = radius
      }
    })
  }

  /** Draw calls saved: per-item meshes now covered by an instanced draw. */
  stats(): { batches: number; instanced: number; singles: number } {
    let instanced = 0
    for (const batch of this.batches) instanced += batch.members.length
    return { batches: this.batches.length, instanced, singles: this.singles.length }
  }

  clear(): void {
    for (const batch of this.batches) {
      for (const member of batch.members) member.model.visible = true
      for (const meshes of batch.lods) {
        for (const mesh of meshes) {
          this.parent.remove(mesh)
          releaseModelGeometry(mesh.geometry)
          mesh.dispose()
        }
      }
    }
    this.batches = []
    this.singles = []
  }

  dispose(): void {
    this.clear()
  }
}
