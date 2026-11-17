import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import '../../src/catalog'
import { buildItem } from '../../src/builders/items'
import { contactShadowFor, contactShadowFromObject, CONTACT } from '../../src/builders/contactShadow'
import type { Item } from '../../src/model/types'

function item(catalogId: string, size: Item['size'], extra: Partial<Item> = {}): Item {
  return {
    id: `i-${catalogId}`,
    catalogId,
    position: { x: 0, y: 0 },
    elevation: 0,
    rotation: 0,
    size,
    materials: {},
    params: {},
    ...extra,
  }
}

/** Decal alpha at a point on the floor, in the decal's parent space, read through a real raycast. */
function alphaAt(decal: THREE.Mesh, x: number, z: number): number {
  decal.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0))
  const hits: THREE.Intersection[] = []
  THREE.Mesh.prototype.raycast.call(decal, ray, hits)
  const uv = hits[0]?.uv
  if (!uv) return 0
  const material = decal.material as THREE.MeshBasicMaterial
  const tex = material.alphaMap as THREE.DataTexture
  const { width, height, data } = tex.image as { width: number; height: number; data: Uint8Array }
  const i = Math.min(width - 1, Math.floor(uv.x * width))
  const j = Math.min(height - 1, Math.floor(uv.y * height))
  return data[(j * width + i) * 4 + 1]! / 255
}

function box(w: number, h: number, d: number, x = 0, y0 = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  mesh.position.set(x, y0 + h / 2, z)
  return mesh
}

describe('contact shadows', () => {
  it('darkens the floor at a table leg and only faintly under the top', () => {
    const decal = contactShadowFor(buildItem(item('dining-table', { w: 1.6, d: 0.9, h: 0.75 })), item('dining-table', { w: 1.6, d: 0.9, h: 0.75 }))
    expect(decal).not.toBeNull()
    const inset = Math.min(0.12, 1.6 * 0.12, 0.9 * 0.12)
    const legX = 0.8 - inset
    const legZ = 0.45 - inset
    // Just beside the leg (the leg itself hides the floor under it).
    const atLeg = alphaAt(decal!, legX + 0.035, legZ)
    const centre = alphaAt(decal!, 0, 0)
    expect(atLeg).toBeGreaterThan(0.35)
    expect(centre).toBeGreaterThan(0)
    expect(centre).toBeLessThan(0.15)
    expect(atLeg).toBeGreaterThan(centre * 3)
  })

  it('draws a tight contact line around a box standing on the floor', () => {
    const group = new THREE.Group()
    group.add(box(0.8, 0.9, 0.5))
    const decal = contactShadowFromObject(group, { w: 0.8, d: 0.5 }, 'test-box')!
    expect(decal).not.toBeNull()
    const near = alphaAt(decal, 0.4 + 0.015, 0)
    const far = alphaAt(decal, 0.4 + 0.22, 0)
    expect(near).toBeGreaterThan(0.3)
    expect(far).toBeLessThan(0.03)
  })

  it('a raised body (sofa underside) shades a soft patch under and around it', () => {
    const group = new THREE.Group()
    group.add(box(1.8, 0.6, 0.9, 0, 0.1)) // body 10 cm off the floor
    for (const x of [-0.85, 0.85]) for (const z of [-0.4, 0.4]) group.add(box(0.04, 0.1, 0.04, x, 0, z))
    const decal = contactShadowFromObject(group, { w: 1.8, d: 0.9 }, 'test-sofa')!
    expect(alphaAt(decal, 0, 0)).toBeGreaterThan(0.3)
    expect(alphaAt(decal, 0, 0.45 + 0.06)).toBeGreaterThan(0.08)
  })

  it('fades to nothing at the edge of the decal', () => {
    const group = new THREE.Group()
    group.add(box(1, 0.5, 1))
    const decal = contactShadowFromObject(group, { w: 1, d: 1 }, 'test-edge')!
    const edge = 0.5 + CONTACT.margin - 0.005
    expect(alphaAt(decal, edge, 0)).toBeLessThan(0.01)
    expect(alphaAt(decal, 0, -edge)).toBeLessThan(0.01)
  })

  it('maps the texture the right way round (no mirrored shadows)', () => {
    const group = new THREE.Group()
    group.add(box(0.05, 0.7, 0.05, 0.3, 0, 0.2)) // one leg at +x, +z
    group.add(box(0.7, 0.03, 0.5, 0, 0.7, 0)) // a high top so the footprint is centred
    const decal = contactShadowFromObject(group, { w: 0.7, d: 0.5 }, 'test-orient')!
    expect(alphaAt(decal, 0.3 + 0.035, 0.2)).toBeGreaterThan(0.3)
    expect(alphaAt(decal, -0.3 - 0.035, 0.2)).toBeLessThan(0.1)
    expect(alphaAt(decal, 0.3 + 0.035, -0.2)).toBeLessThan(0.1)
  })

  it('casts nothing for something hanging well above the floor', () => {
    const group = new THREE.Group()
    group.add(box(0.5, 0.3, 0.5, 0, 1.6))
    expect(contactShadowFromObject(group, { w: 0.5, d: 0.5 }, 'test-hang')).toBeNull()
  })

  it('skips raised, wall-mounted and flat items', () => {
    const raised = item('dining-chair', { w: 0.46, d: 0.5, h: 0.9 }, { elevation: 0.75 })
    expect(contactShadowFor(buildItem(raised), raised)).toBeNull()
    const rug = item('rug', { w: 2, d: 1.4, h: 0.02 })
    expect(contactShadowFor(buildItem(rug), rug)).toBeNull()
  })

  it('shares one texture between items of the same model and size', () => {
    const a = item('dining-chair', { w: 0.46, d: 0.5, h: 0.9 })
    const b = { ...a, id: 'other', position: { x: 3, y: 1 }, rotation: 1 }
    const da = contactShadowFor(buildItem(a), a)!
    const db = contactShadowFor(buildItem(b), b)!
    expect(da.material).toBe(db.material)
  })

  it('stays out of picking, shadows and the G-buffer', () => {
    const a = item('dining-chair', { w: 0.46, d: 0.5, h: 0.9 })
    const decal = contactShadowFor(buildItem(a), a)!
    const material = decal.material as THREE.MeshBasicMaterial
    expect(material.depthWrite).toBe(false)
    expect(material.transparent).toBe(true)
    expect(decal.castShadow).toBe(false)
    expect(decal.receiveShadow).toBe(false)
    const hits: THREE.Intersection[] = []
    decal.raycast(new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)), hits)
    expect(hits).toHaveLength(0)
  })
})
