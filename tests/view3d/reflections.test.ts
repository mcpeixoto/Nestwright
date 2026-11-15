import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { gameMaterial } from '../../src/catalog/models/template'
import { getMaterial } from '../../src/materials/materialCache'
import { PROBE_LAYER } from '../../src/view3d/lighting/probeVolume'
import {
  hasRoomReflection,
  REFLECTION_LAYER,
  ReflectionPool,
  reflectRoom,
  roomEnvNode,
  showRoomReflection,
  shownRoomReflection,
} from '../../src/view3d/lighting/reflectionProbe'

describe('room reflections on materials', () => {
  it('gives indoor library materials the room environment and keeps the sky on their outdoor twins', () => {
    const ref = { id: 'leather-black' }
    const indoor = getMaterial(ref)
    const outdoor = getMaterial(ref, { outdoor: true })
    expect(hasRoomReflection(indoor)).toBe(true)
    expect((indoor as unknown as { envNode: unknown }).envNode).toBe(roomEnvNode)
    expect(outdoor).not.toBe(indoor)
    expect(hasRoomReflection(outdoor)).toBe(false)
  })

  it('gives scanned furniture materials the room environment', () => {
    const { material } = gameMaterial(new THREE.MeshStandardMaterial({ name: 'leather' }), 'sofa')
    expect(hasRoomReflection(material)).toBe(true)
  })

  it('leaves non-PBR and outdoor-tagged materials alone', () => {
    const basic = new THREE.MeshBasicMaterial()
    reflectRoom(basic)
    expect(hasRoomReflection(basic)).toBe(false)
    const tagged = new THREE.MeshStandardMaterial()
    tagged.userData.outdoor = true
    reflectRoom(tagged)
    expect(hasRoomReflection(tagged)).toBe(false)
  })
})

describe('ReflectionPool', () => {
  it('allocates one capture cube and a fixed slot count, seeing the probe layer and lamp shades', () => {
    const pool = new ReflectionPool(2, 64)
    expect(pool.slots).toBe(2)
    expect(pool.capture.width).toBe(64)
    // A stencil keeps the capture's render objects apart from the irradiance batch's (see the class).
    expect(pool.capture.stencilBuffer).toBe(true)
    expect(pool.texture(0)).toBeNull()
    for (const camera of pool.cubeCamera.children) {
      expect(camera.layers.isEnabled(PROBE_LAYER)).toBe(true)
      expect(camera.layers.isEnabled(REFLECTION_LAYER)).toBe(true)
      expect(camera.layers.isEnabled(0)).toBe(false)
    }
    expect(REFLECTION_LAYER).not.toBe(PROBE_LAYER)
    pool.dispose()
  })

  it('drops a disposed capture from show', () => {
    const texture = new THREE.CubeTexture()
    showRoomReflection({ texture, box: new THREE.Box3(), origin: new THREE.Vector3(), gain: 1 })
    expect(shownRoomReflection()).toBe(texture)
    showRoomReflection(null)
    expect(shownRoomReflection()).toBeNull()
  })
})
