import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildStair } from '../../src/builders/stairs'
import { familyHouse } from '../../src/templates'

function boxParams(mesh: THREE.Mesh): { width: number; height: number; depth: number } | null {
  const geometry = mesh.geometry as THREE.BoxGeometry
  return geometry.type === 'BoxGeometry' ? geometry.parameters : null
}

describe('stair railing', () => {
  it('joins each handrail segment to the tops of two posts', () => {
    const project = familyHouse()
    const ground = project.levels.find((level) => level.name === 'Ground')
    const stair = ground?.stairs[0]
    if (!ground || !stair) throw new Error('family template has no stair')
    expect(stair.railing).toBe(true)
    const group = buildStair(stair, ground)
    group.updateMatrixWorld(true)
    const posts: THREE.Vector3[] = []
    const rails: THREE.Mesh[] = []
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const p = boxParams(object)
      if (!p) return
      if (p.width === 0.04 && p.height === 0.9 && p.depth === 0.04) {
        posts.push(new THREE.Vector3(0, 0.45, 0).applyMatrix4(object.matrixWorld))
      } else if (p.height === 0.04 && p.depth === 0.04 && p.width > 0.05) {
        rails.push(object)
      }
    })
    expect(posts.length).toBeGreaterThan(2)
    expect(rails.length).toBeGreaterThan(1)
    const nearestPost = (point: THREE.Vector3) => Math.min(...posts.map((top) => top.distanceTo(point)))
    for (const rail of rails) {
      const half = (boxParams(rail)?.width ?? 0) / 2
      const ends = [new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0)].map((end) => end.applyMatrix4(rail.matrixWorld))
      for (const end of ends) expect(nearestPost(end)).toBeLessThan(1e-3)
    }
  })
})
