import type * as THREE from 'three'
import { lights } from 'three/tsl'

/**
 * Light list for outdoor materials: every scene light except the lamp shadow pool.
 *
 * Apple GPUs allow 16 samplers per fragment stage. The splat ground already samples ~12
 * textures, the sun cascades add 3–4, so the pool's 6 cube shadows would push it past the
 * limit and the pipeline fails. The pool only ever stands in for indoor lamps, whose light
 * the walls keep off the ground anyway, so outdoor materials simply skip it.
 */
export interface OutdoorLights {
  update(): void
  apply(material: THREE.Material): void
}

function shown(obj: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = obj
  while (cursor) {
    if (!cursor.visible) return false
    if (!cursor.parent) return (cursor as THREE.Scene).isScene === true
    cursor = cursor.parent
  }
  return false
}

export function createOutdoorLights(scene: THREE.Scene): OutdoorLights {
  const node = lights([])
  let key = ''
  let frame = 0
  const collect = () => {
    const list: THREE.Light[] = []
    scene.traverse((obj) => {
      const light = obj as THREE.Light
      if (light.isLight && !light.userData.lampPool && shown(light)) list.push(light)
    })
    const next = list.map((light) => light.id).join(',')
    if (next === key) return
    key = next
    node.setLights(list)
  }
  return {
    update() {
      if (frame++ % 10 === 0) collect()
    },
    apply(material) {
      const mat = material as THREE.Material & { isNodeMaterial?: boolean; lightsNode?: unknown }
      if (!mat.isNodeMaterial || mat.lightsNode === node) return
      if (key === '') collect()
      mat.lightsNode = node
      mat.needsUpdate = true
    },
  }
}
