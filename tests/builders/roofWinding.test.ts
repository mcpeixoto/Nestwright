import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildRoof } from '../../src/builders/roofs'
import { createLevel } from '../../src/model/defaults'
import type { Roof, RoofShape } from '../../src/model/types'

function roof(shape: RoofShape, cutouts: Roof['cutouts'] = []): Roof {
  return {
    id: `roof_${shape}`,
    shape,
    outline: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ],
    pitch: Math.PI / 6,
    overhang: 0.3,
    ridgeAngle: 0,
    thickness: 0.08,
    material: { id: 'roof-tiles' },
    cutouts,
  }
}

/** Triangles whose winding (counter-clockwise = front) points the same way as their vertex normal. */
function windingAgreement(mesh: THREE.Mesh): { agree: number; disagree: number } {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position')
  const nrm = geo.getAttribute('normal')
  const index = geo.getIndex()
  const count = index ? index.count : pos.count
  const at = (i: number) => (index ? index.getX(i) : i)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  let agree = 0
  let disagree = 0
  for (let t = 0; t < count; t += 3) {
    const ia = at(t)
    a.fromBufferAttribute(pos, ia)
    b.fromBufferAttribute(pos, at(t + 1))
    c.fromBufferAttribute(pos, at(t + 2))
    const face = b.sub(a).cross(c.sub(a))
    if (face.lengthSq() < 1e-12) continue
    n.fromBufferAttribute(nrm, ia)
    if (face.dot(n) > 0) agree++
    else disagree++
  }
  return { agree, disagree }
}

describe('roof faces', () => {
  // Inside-out faces are culled from above, so the sky saw the slab's underside: a normal
  // pointing down, no sun, and GTAO reading the whole roof as occluded (near-black tiles).
  for (const shape of ['gable', 'hip', 'shed', 'flat', 'mansard', 'dome'] as RoofShape[]) {
    it(`${shape}: every triangle faces the way its normal points`, () => {
      const level = createLevel('Ground', 0)
      const cut = [
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 3 },
        { x: 3, y: 3 },
      ]
      const group = buildRoof(roof(shape, [cut]), level)
      let meshes = 0
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || mesh.userData.kind !== 'roof') return
        meshes++
        const { agree, disagree } = windingAgreement(mesh)
        expect(disagree, `mesh ${meshes} of ${shape}`).toBe(0)
        expect(agree).toBeGreaterThan(0)
      })
      expect(meshes).toBeGreaterThan(0)
    })
  }


  it('turns the fascia away from the roof', () => {
    const group = buildRoof(roof('flat'), createLevel('Ground', 0))
    const centre = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3())
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    let sides = 0
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.kind !== 'roof') return
      const pos = mesh.geometry.getAttribute('position')
      const nrm = mesh.geometry.getAttribute('normal')
      for (let i = 0; i < nrm.count; i++) {
        n.fromBufferAttribute(nrm, i)
        if (Math.abs(n.y) > 0.5) continue
        p.fromBufferAttribute(pos, i).sub(centre)
        p.y = 0
        sides++
        expect(p.dot(n)).toBeGreaterThan(0)
      }
    })
    expect(sides).toBeGreaterThan(0)
  })
})
