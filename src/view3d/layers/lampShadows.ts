import * as THREE from 'three'
import { registerSceneLayer } from '../layers'

const LIMIT = 8

registerSceneLayer({
  id: 'lamp-shadows',
  create(ctx) {
    const lights: (THREE.PointLight | THREE.SpotLight)[] = []
    return {
      sync() {},
      update() {
        lights.length = 0
        ctx.scene.traverse((obj) => {
          const light = obj as THREE.Light
          if (light.userData?.lampLight && (light instanceof THREE.PointLight || light instanceof THREE.SpotLight)) {
            lights.push(light)
          }
        })
        const camera = ctx.camera.position
        lights.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceToSquared(camera) - b.getWorldPosition(new THREE.Vector3()).distanceToSquared(camera))
        lights.forEach((light, index) => {
          const on = index < LIMIT
          light.castShadow = on
          if (!on) return
          light.shadow.mapSize.set(256, 256)
          light.shadow.bias = -0.005
        })
      },
      dispose() {
        for (const light of lights) light.castShadow = false
      },
    }
  },
})
