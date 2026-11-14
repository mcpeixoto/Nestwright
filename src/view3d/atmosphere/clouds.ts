import * as THREE from 'three'
import { cameraPosition, float, floor, fract, Fn, Loop, mix, positionWorld, smoothstep, step, uniform, vec3 } from 'three/tsl'

type V3 = THREE.Node<'vec3'>

const hash = Fn(([source]: [V3]) => {
  const p = fract(source.mul(0.3183099).add(vec3(0.11, 0.17, 0.13))).mul(17.0).toVar()
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)))
})

const noise = Fn(([p]: [V3]) => {
  const i = floor(p).toVar()
  const f0 = fract(p)
  const f = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0))).toVar()
  const corner = (x: number, y: number, z: number) => hash(i.add(vec3(x, y, z)))
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), f.x), mix(corner(0, 1, 0), corner(1, 1, 0), f.x), f.y),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), f.x), mix(corner(0, 1, 1), corner(1, 1, 1), f.x), f.y),
    f.z,
  )
})

const fbm = Fn(([source]: [V3]) => {
  const p = vec3(source).toVar()
  const v = float(0).toVar()
  const a = float(0.5).toVar()
  Loop(5, () => {
    v.addAssign(a.mul(noise(p)))
    p.assign(p.mul(2.03).add(vec3(1.7, 9.2, 2.4)))
    a.mulAssign(0.5)
  })
  return v
})

export interface CloudDome {
  mesh: THREE.Mesh
  set(density: number, cover: number, color: string): void
  drift(elapsed: number): void
  dispose(): void
}

// PHASE1-PORT: like-for-like TSL port of the fbm cloud dome.
export function createClouds(): CloudDome {
  const uTime = uniform(0)
  const uDensity = uniform(0.35)
  const uCover = uniform(0.55)
  const color = new THREE.Color('#f4f6f8')
  const uColor = uniform(color)
  const dir = positionWorld.sub(cameraPosition).normalize()
  const p = dir.mul(2.6).add(vec3(uTime.mul(0.012), 0.0, uTime.mul(0.008)))
  const n = fbm(p)
  const clouds = smoothstep(uCover, uCover.add(0.22), n)
  // Below 0.02 the old shader discarded; alphaTest does that here.
  const alpha = clouds.mul(uDensity).mul(smoothstep(0.0, 0.22, dir.y)).mul(step(0.02, dir.y))
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    alphaTest: 0.01,
    fog: false,
  })
  material.colorNode = uColor
  material.opacityNode = alpha
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 24), material)
  mesh.name = 'clouds'
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return {
    mesh,
    set(density, cover, next) {
      uDensity.value = density
      uCover.value = cover
      color.set(next)
    },
    drift(elapsed) {
      uTime.value = elapsed
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
