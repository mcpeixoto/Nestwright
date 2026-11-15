import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildModel, isSharedGeometry, releaseModelGeometry, type ModelTemplate } from '../../src/catalog/models'
import { flattenScene, gameMaterial, markShared, partsBounds, shareLod0Materials, type ModelPart } from '../../src/catalog/models/template'
import { ModelInstancer } from '../../src/view3d/modelInstances'

/** A 1.8 × 0.8 × 0.7 "sofa": one box, finely split along x so slicing can bend it. */
function sofaTemplate(): ModelTemplate {
  // flattenScene marks a loaded model's geometry shared; do the same here.
  const geometry = markShared(new THREE.BoxGeometry(1.8, 0.7, 0.8, 36, 1, 1))
  geometry.translate(0, 0.35, 0)
  const material = new THREE.MeshStandardMaterial({ name: 'fabric' })
  const part: ModelPart = { name: 'fabric', geometry, material, shade: false, glass: false }
  const far: ModelPart = { name: 'fabric', geometry: new THREE.BoxGeometry(1.8, 0.7, 0.8).translate(0, 0.35, 0), material: new THREE.MeshStandardMaterial({ name: 'fabric' }), shade: false, glass: false }
  const lod0 = [part]
  const { bounds, radius } = partsBounds(lod0)
  return { key: 'sofa-test', catalogId: 'sofa-3', bounds, radius, lod0, lod1: shareLod0Materials([far], lod0) }
}

function meshes(root: THREE.Object3D, lod: number): THREE.Mesh[] {
  const group = root.children.find((child) => child.userData.lod === lod)
  return (group?.children ?? []) as THREE.Mesh[]
}

describe('scanned models', () => {
  it('shares geometry and materials across items with a uniform fit', () => {
    const template = sofaTemplate()
    const a = buildModel(template, { w: 2, d: 0.9, h: 0.8 })
    const b = buildModel(template, { w: 2, d: 0.9, h: 0.8 })
    const ma = meshes(a, 0)[0]!
    const mb = meshes(b, 0)[0]!
    expect(ma.geometry).toBe(mb.geometry)
    expect(ma.material).toBe(mb.material)
    expect(isSharedGeometry(ma.geometry)).toBe(true)
    expect(a.userData.model.instanceKey).toBe(b.userData.model.instanceKey)
  })

  it('gives LOD1 the LOD0 material of the same name', () => {
    const template = sofaTemplate()
    expect(template.lod1?.[0]?.material).toBe(template.lod0[0]?.material)
    const root = buildModel(template, { w: 1.8, d: 0.8, h: 0.7 })
    expect(root.children.find((child) => child.userData.lod === 1)?.visible).toBe(false)
  })

  it('slices a stretched sofa so the arms keep their thickness', () => {
    const template = sofaTemplate()
    const root = buildModel(template, { w: 2.6, d: 0.8, h: 0.7 })
    const mesh = meshes(root, 0)[0]!
    expect(mesh.geometry).not.toBe(template.lod0[0]!.geometry)
    const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
    expect(box.max.x - box.min.x).toBeCloseTo(2.6, 4)
    // A vertex inside the arm (0.25 m from the end, within the outer 0.27 m) stays 0.25 m from
    // the end; plain stretching would put it 0.36 m in.
    const xs = new Set<number>()
    const pos = mesh.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) xs.add(Math.round(pos.getX(i) * 1e4) / 1e4)
    expect([...xs]).toContain(1.05)
    expect([...xs]).toContain(-1.05)
    // Normals stay unit length.
    const normal = mesh.geometry.getAttribute('normal')
    for (let i = 0; i < normal.count; i += 7) {
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5)
    }
    // A second item of the same size reuses the sliced copy; it is freed with its last user.
    const again = buildModel(template, { w: 2.6, d: 0.8, h: 0.7 })
    const twin = meshes(again, 0)[0]!
    expect(twin.geometry).toBe(mesh.geometry)
    let disposed = 0
    mesh.geometry.addEventListener('dispose', () => {
      disposed += 1
    })
    releaseModelGeometry(mesh.geometry)
    expect(disposed).toBe(0)
    releaseModelGeometry(twin.geometry)
    expect(disposed).toBe(1)
  })

  it('bakes node scale into float positions instead of clamping quantized ones', () => {
    const geometry = new THREE.BufferGeometry()
    // Normalised int16 like a meshopt file: ±1 here means ±1.07 m once the node scale applies.
    const ints = new Int16Array([-32767, 0, 0, 32767, 32767, 0, 0, 32767, 32767])
    geometry.setAttribute('position', new THREE.BufferAttribute(ints, 3, true))
    const scene = new THREE.Group()
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'm' }))
    mesh.scale.setScalar(1.07)
    scene.add(mesh)
    const [part] = flattenScene(scene, 'k', (source) => ({ material: source as THREE.MeshStandardMaterial, glass: false }))
    const position = part!.geometry.getAttribute('position')
    expect(position.array).toBeInstanceOf(Float32Array)
    expect(position.getY(1)).toBeCloseTo(1.07, 3)
    expect(position.getX(0)).toBeCloseTo(-1.07, 3)
  })

  it('turns transmissive glass into a cheap transparent standard material', () => {
    const glass = new THREE.MeshPhysicalMaterial({ name: 'clock_glass', transmission: 1 })
    const { material, glass: isGlass } = gameMaterial(glass, 'clock')
    expect(isGlass).toBe(true)
    expect((material as unknown as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).toBeUndefined()
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeLessThan(0.5)
  })
})

describe('model instancing', () => {
  function item(id: string, x: number, template: ModelTemplate, size = { w: 2, d: 0.9, h: 0.8 }): { id: string; object: THREE.Object3D } {
    const object = new THREE.Group()
    object.position.set(x, 0, 0)
    const built = new THREE.Group()
    built.add(buildModel(template, size))
    object.add(built)
    object.userData.entityId = id
    return { id, object }
  }

  it('draws identical items as one InstancedMesh per part and LOD, keeping hidden pick proxies', () => {
    const template = sofaTemplate()
    const parent = new THREE.Group()
    const items = [item('a', 0, template), item('b', 3, template), item('c', 6, template, { w: 2.8, d: 0.9, h: 0.8 })]
    for (const entry of items) parent.add(entry.object)
    const instancer = new ModelInstancer(parent)
    instancer.rebuild(items)
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 1.6, 4)
    camera.updateMatrixWorld()
    instancer.update(camera, true)
    const instanced = parent.children.filter((child) => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[]
    // a + b share a fit: LOD0 and LOD1 for one part. c (stretched) draws on its own.
    expect(instanced).toHaveLength(2)
    expect(instancer.stats()).toEqual({ batches: 1, instanced: 2, singles: 1 })
    const near = instanced.find((mesh) => mesh.count === 2)
    expect(near?.userData.instanceIds).toEqual(['a', 'b'])
    expect(near?.castShadow).toBe(true)
    const proxyA = items[0]!.object.getObjectByName('model')!
    const proxyC = items[2]!.object.getObjectByName('model')!
    expect(proxyA.visible).toBe(false)
    expect(proxyC.visible).toBe(true)
    // Far away, both move to LOD1.
    camera.position.set(0, 1.6, 40)
    camera.updateMatrixWorld()
    instancer.update(camera, true)
    const lod1 = instanced.find((mesh) => mesh.count === 2)
    expect(lod1).not.toBe(near)
    instancer.dispose()
    expect(parent.children.some((child) => (child as THREE.InstancedMesh).isInstancedMesh)).toBe(false)
    expect(proxyA.visible).toBe(true)
  })
})
