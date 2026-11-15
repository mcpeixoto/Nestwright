import * as THREE from 'three'
import { sampleHeight } from '../../model/terrain'
import type { Terrain } from '../../model/types'
import { IMPOSTOR_ATTRIBUTE, IMPOSTOR_YAW_ATTRIBUTE } from './foliageMaterials'
import type { FoliageVariant, SpeciesAssets } from './treeLibrary'
import { lodFor, PLANT_SWAY_ATTRIBUTE, swayPhase, variantOf } from './treeSpecies'

type Plant = Terrain['plants'][number]

interface Placed {
  id: string
  matrix: THREE.Matrix4
  position: THREE.Vector3
  scale: number
  yaw: number
  phase: number
}

/** Mesh slots of one stand: near bark, near leaves, mid bark, mid leaves, impostor. */
const NEAR_BARK = 0
const NEAR_LEAVES = 1
const MID_BARK = 2
const MID_LEAVES = 3
const FAR = 4

interface Slot {
  mesh: THREE.InstancedMesh
  info: THREE.InstancedBufferAttribute
  impostor?: THREE.InstancedBufferAttribute
  yaw?: THREE.InstancedBufferAttribute
}

interface Stand {
  asset: SpeciesAssets
  variant: FoliageVariant
  plants: Placed[]
  level: Int8Array
  slots: (Slot | null)[]
  /** The impostor material the far slot was built with (it arrives after the meshes). */
  far: THREE.Material | null
  dirty: boolean
}

let quad: THREE.BufferGeometry | null = null

/** Unit impostor card: x in [-0.5, 0.5], y in [0, 1]; the material places and turns it. */
function impostorQuad(): THREE.BufferGeometry {
  if (quad) return quad
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.translate(0, 0.5, 0)
  quad = geo
  return geo
}

function shareGeometry(base: THREE.BufferGeometry, extra: Record<string, THREE.InstancedBufferAttribute>): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr)
  for (const [name, attr] of Object.entries(extra)) geo.setAttribute(name, attr)
  geo.setIndex(base.getIndex())
  geo.boundingSphere = base.boundingSphere?.clone() ?? null
  geo.boundingBox = base.boundingBox?.clone() ?? null
  return geo
}

/**
 * Generated trees, bushes and hedges, instanced per species × variant × LOD. Each plant keeps
 * its LOD between frames and only crosses a switch distance past a hysteresis band, so an
 * orbit does not make trees flicker between meshes.
 */
export class TreeField {
  readonly group = new THREE.Group()
  private stands = new Map<string, Stand>()
  private camera = new THREE.Vector3()

  constructor() {
    this.group.name = 'trees'
  }

  /** Rebuild the stands for these plants (all of species the library has ready). */
  sync(
    terrain: Terrain,
    plants: Plant[],
    assets: (species: string) => SpeciesAssets | null,
    groundAt: (x: number, z: number) => number = (x, z) => sampleHeight(terrain, x, z),
  ): void {
    const lists = new Map<string, { asset: SpeciesAssets; variant: FoliageVariant; plants: Placed[] }>()
    const dummy = new THREE.Object3D()
    for (const plant of plants) {
      const asset = assets(plant.species)
      if (!asset || asset.variants.length === 0) continue
      const v = variantOf(plant.id, asset.variants.length)
      const variant = asset.variants[v]
      if (!variant) continue
      const key = `${plant.species}:${v}`
      let list = lists.get(key)
      if (!list) {
        list = { asset, variant, plants: [] }
        lists.set(key, list)
      }
      const scale = Number.isFinite(plant.scale) && plant.scale > 0 ? plant.scale : 1
      const y = groundAt(plant.position.x, plant.position.y)
      const yaw = Number.isFinite(plant.rotation) ? -plant.rotation : 0
      dummy.position.set(plant.position.x, Number.isFinite(y) ? y : 0, plant.position.y)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      list.plants.push({
        id: plant.id,
        matrix: dummy.matrix.clone(),
        position: dummy.position.clone(),
        scale,
        yaw,
        phase: swayPhase(plant.position.x, plant.position.y),
      })
    }
    for (const [key, stand] of this.stands) {
      const next = lists.get(key)
      if (next && next.variant === stand.variant && next.asset === stand.asset) continue
      this.drop(stand)
      this.stands.delete(key)
    }
    for (const [key, list] of lists) {
      let stand = this.stands.get(key)
      if (!stand) {
        stand = { asset: list.asset, variant: list.variant, plants: [], level: new Int8Array(0), slots: [], far: null, dirty: true }
        this.stands.set(key, stand)
      }
      const before = new Map<string, number>()
      stand.plants.forEach((p, i) => before.set(p.id, stand!.level[i] ?? -1))
      stand.plants = list.plants
      stand.level = new Int8Array(list.plants.length).fill(-1)
      list.plants.forEach((p, i) => {
        stand!.level[i] = before.get(p.id) ?? -1
      })
      this.ensureSlots(stand)
      stand.dirty = true
    }
  }

  private ensureSlots(stand: Stand): void {
    const need = stand.plants.length
    const old = stand.slots
    const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, need))))
    const fits = old.length > 0 && old.every((slot) => !slot || slot.info.count >= need)
    const farReady = stand.variant.impostorMaterial
    if (fits && stand.far === farReady) return
    for (const slot of old) if (slot) this.dropSlot(slot)
    const { variant, asset } = stand
    const make = (geo: THREE.BufferGeometry, material: THREE.Material, leaves: boolean): Slot => {
      const info = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
      info.setUsage(THREE.DynamicDrawUsage)
      const mesh = new THREE.InstancedMesh(shareGeometry(geo, { [PLANT_SWAY_ATTRIBUTE]: info }), material, capacity)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.userData.kind = 'plant'
      mesh.userData.leafCards = leaves
      this.group.add(mesh)
      return { mesh, info }
    }
    const slots: (Slot | null)[] = [null, null, null, null, null]
    slots[NEAR_BARK] = make(variant.near.bark, asset.bark, false)
    slots[NEAR_LEAVES] = make(variant.near.leaves, asset.leaves, true)
    if (variant.mid) {
      slots[MID_BARK] = make(variant.mid.bark, asset.bark, false)
      slots[MID_LEAVES] = make(variant.mid.leaves, asset.leaves, true)
    }
    if (farReady) {
      const info = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
      const impostor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
      const yaw = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      for (const attr of [info, impostor, yaw]) attr.setUsage(THREE.DynamicDrawUsage)
      const geo = shareGeometry(impostorQuad(), {
        [PLANT_SWAY_ATTRIBUTE]: info,
        [IMPOSTOR_ATTRIBUTE]: impostor,
        [IMPOSTOR_YAW_ATTRIBUTE]: yaw,
      })
      const mesh = new THREE.InstancedMesh(geo, farReady, capacity)
      // The card is placed in the shader from its own attributes; matrices stay identity.
      mesh.frustumCulled = false
      mesh.count = 0
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.kind = 'plant'
      mesh.userData.noShadow = true
      mesh.raycast = () => {}
      this.group.add(mesh)
      slots[FAR] = { mesh, info, impostor, yaw }
    }
    stand.slots = slots
    stand.far = farReady
    stand.dirty = true
  }

  /** Pick each plant's LOD for this camera and refill the instance buffers that changed. */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camera)
    for (const stand of this.stands.values()) {
      if (stand.far !== stand.variant.impostorMaterial) this.ensureSlots(stand)
      const kind = stand.asset.spec.lods
      const hasMid = !!stand.slots[MID_BARK]
      const hasFar = !!stand.slots[FAR]
      for (let i = 0; i < stand.plants.length; i++) {
        const p = stand.plants[i]!
        let level = lodFor(p.position.distanceTo(this.camera) / Math.max(0.6, Math.sqrt(p.scale)), stand.level[i] ?? -1, kind)
        if (level === 2 && !hasFar) level = hasMid ? 1 : 0
        if (level === 1 && !hasMid) level = 0
        if (level !== stand.level[i]) {
          stand.level[i] = level
          stand.dirty = true
        }
      }
      if (stand.dirty) this.fill(stand)
    }
  }

  private fill(stand: Stand): void {
    stand.dirty = false
    const counts = [0, 0, 0, 0, 0]
    const ids: string[][] = [[], [], [], [], []]
    const put = (slotIndex: number, p: Placed) => {
      const slot = stand.slots[slotIndex]
      if (!slot) return
      const i = counts[slotIndex]!++
      slot.info.setXY(i, p.phase, p.scale)
      ids[slotIndex]!.push(p.id)
      if (slotIndex === FAR) {
        slot.impostor?.setXYZW(i, p.position.x, p.position.y, p.position.z, p.scale)
        slot.yaw?.setX(i, p.yaw)
      } else {
        slot.mesh.setMatrixAt(i, p.matrix)
      }
    }
    stand.plants.forEach((p, i) => {
      const level = stand.level[i] ?? 0
      if (level <= 0) {
        put(NEAR_BARK, p)
        put(NEAR_LEAVES, p)
      } else if (level === 1) {
        put(MID_BARK, p)
        put(MID_LEAVES, p)
      } else {
        put(FAR, p)
      }
    })
    stand.slots.forEach((slot, index) => {
      if (!slot) return
      slot.mesh.count = counts[index] ?? 0
      slot.mesh.visible = slot.mesh.count > 0
      slot.mesh.userData.instanceIds = ids[index]
      slot.info.needsUpdate = true
      if (slot.impostor) slot.impostor.needsUpdate = true
      if (slot.yaw) slot.yaw.needsUpdate = true
      if (index !== FAR) {
        slot.mesh.instanceMatrix.needsUpdate = true
        slot.mesh.boundingSphere = null
        if (slot.mesh.count > 0) slot.mesh.computeBoundingSphere()
      }
    })
  }

  /** Triangles drawn per LOD right now (main pass), for the HUD and tests. */
  stats(): { near: number; mid: number; far: number; meshes: number } {
    const out = { near: 0, mid: 0, far: 0, meshes: 0 }
    for (const stand of this.stands.values()) {
      stand.slots.forEach((slot, index) => {
        if (!slot || slot.mesh.count === 0) return
        out.meshes++
        const index3 = slot.mesh.geometry.getIndex()
        const tris = ((index3 ? index3.count : slot.mesh.geometry.getAttribute('position').count) / 3) * slot.mesh.count
        if (index <= NEAR_LEAVES) out.near += tris
        else if (index <= MID_LEAVES) out.mid += tris
        else out.far += tris
      })
    }
    return out
  }

  private dropSlot(slot: Slot): void {
    this.group.remove(slot.mesh)
    slot.mesh.dispose()
    // Only the per-instance buffers: vertex buffers belong to the library's variant.
    slot.info.dispose()
    slot.impostor?.dispose()
    slot.yaw?.dispose()
  }

  private drop(stand: Stand): void {
    for (const slot of stand.slots) if (slot) this.dropSlot(slot)
    stand.slots = []
  }

  dispose(): void {
    for (const stand of this.stands.values()) this.drop(stand)
    this.stands.clear()
  }
}
