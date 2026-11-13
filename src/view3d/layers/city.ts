import * as THREE from 'three'
import type { Project } from '../../model/types'
import { sunDirection } from '../../model/sunLook'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext } from '../layers'

const BUILDING_COUNT = 32

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function windowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#5c636a'
  ctx.fillRect(0, 0, 64, 96)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 3; x++) {
      const lit = hash(x * 9 + y * 4) > 0.35
      ctx.fillStyle = lit ? '#ffd7a8' : '#1c2430'
      ctx.fillRect(8 + x * 18, 10 + y * 22, 10, 14)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function unitBox(project: Project): { minX: number; maxX: number; minZ: number; maxZ: number; top: number } | null {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let top = 0
  let any = false
  for (const level of project.levels ?? []) {
    if (!level || !Array.isArray(level.walls) || level.walls.length === 0) continue
    any = true
    top = Math.max(top, level.elevation || 0)
    for (const wall of level.walls) {
      minX = Math.min(minX, wall.a.x, wall.b.x)
      maxX = Math.max(maxX, wall.a.x, wall.b.x)
      minZ = Math.min(minZ, wall.a.y, wall.b.y)
      maxZ = Math.max(maxZ, wall.a.y, wall.b.y)
    }
  }
  if (!any || !Number.isFinite(minX)) return null
  return { minX, maxX, minZ, maxZ, top }
}

export function createCityLayer(ctx: SceneLayerContext): SceneLayer {
  const group = new THREE.Group()
  group.name = 'city'
  group.visible = false

  const pavementGeo = new THREE.PlaneGeometry(1, 1)
  const pavementMat = new THREE.MeshStandardMaterial({ color: '#8a8d88', roughness: 0.92, metalness: 0 })
  const pavement = new THREE.Mesh(pavementGeo, pavementMat)
  pavement.rotation.x = -Math.PI / 2
  pavement.position.y = -0.05
  pavement.receiveShadow = true
  pavement.name = 'pavement'
  group.add(pavement)

  const streetMat = new THREE.MeshStandardMaterial({ color: '#3a3e42', roughness: 0.96 })
  const streetGeo = new THREE.PlaneGeometry(1, 1)
  for (let i = -3; i <= 3; i++) {
    const east = new THREE.Mesh(streetGeo, streetMat)
    east.rotation.x = -Math.PI / 2
    east.position.set(0, -0.03, i * 28)
    east.scale.set(220, 8, 1)
    east.receiveShadow = true
    group.add(east)
    const north = new THREE.Mesh(streetGeo, streetMat)
    north.rotation.x = -Math.PI / 2
    north.position.set(i * 28, -0.03, 0)
    north.scale.set(8, 220, 1)
    north.receiveShadow = true
    group.add(north)
  }

  const facade = windowTexture()
  const buildingMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.86,
    metalness: 0,
    map: facade,
    emissive: new THREE.Color('#ffcc88'),
    emissiveMap: facade,
    emissiveIntensity: 0,
  })
  if (buildingMat.map) buildingMat.map.colorSpace = THREE.SRGBColorSpace
  const shellMat = buildingMat.clone()
  shellMat.color.set('#6a7178')

  const geos: THREE.BufferGeometry[] = [pavementGeo, streetGeo]
  for (let i = 0; i < BUILDING_COUNT; i++) {
    const gx = (i % 8) - 3.5
    const gz = Math.floor(i / 8) - 1.5
    const x = gx * 22 + (hash(i + 3) - 0.5) * 4
    const z = gz * 24 + (hash(i + 8) - 0.5) * 4
    if (Math.abs(x) < 20 && Math.abs(z) < 16) continue
    const w = 8 + hash(i + 1) * 8
    const d = 7 + hash(i + 2) * 7
    const h = 8 + hash(i + 5) * 28
    const geo = new THREE.BoxGeometry(w, h, d)
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, buildingMat)
    mesh.position.set(x, h / 2, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const uv = geo.getAttribute('uv')
    if (uv) {
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 4), uv.getY(k) * (h / 6))
      uv.needsUpdate = true
    }
    group.add(mesh)
  }

  let shell: THREE.Mesh | null = null
  let shellGeo: THREE.BoxGeometry | null = null
  ctx.scene.add(group)

  const nightOf = (project: Project): boolean => {
    const env = project.environment
    if (!env) return false
    try {
      const sun = sunDirection(env.dayOfYear ?? 172, env.time ?? 12, env.latitude ?? 41, env.north ?? 0)
      return sun.y < (-6 * Math.PI) / 180
    } catch {
      return false
    }
  }

  return {
    sync(project: Project) {
      const apartment = project?.kind === 'apartment'
      group.visible = apartment
      if (!apartment) return
      pavement.scale.set(240, 240, 1)
      const night = nightOf(project)
      buildingMat.emissiveIntensity = night ? 0.85 : 0
      shellMat.emissiveIntensity = night ? 0.7 : 0
      const box = unitBox(project)
      if (shell) {
        group.remove(shell)
        shell.geometry.dispose()
        shell = null
        shellGeo = null
      }
      if (!box || box.top < 1.2) return
      const pad = 0.8
      const w = Math.max(2, box.maxX - box.minX + pad * 2)
      const d = Math.max(2, box.maxZ - box.minZ + pad * 2)
      const h = box.top
      shellGeo = new THREE.BoxGeometry(w, h, d)
      shell = new THREE.Mesh(shellGeo, shellMat)
      shell.position.set((box.minX + box.maxX) / 2, h / 2, (box.minZ + box.maxZ) / 2)
      shell.castShadow = true
      shell.receiveShadow = true
      group.add(shell)
    },
    dispose() {
      ctx.scene.remove(group)
      for (const geo of geos) geo.dispose()
      shellGeo?.dispose()
      pavementMat.dispose()
      streetMat.dispose()
      buildingMat.map?.dispose()
      buildingMat.dispose()
      shellMat.dispose()
    },
  }
}

registerSceneLayer({
  id: 'city',
  create: createCityLayer,
})
