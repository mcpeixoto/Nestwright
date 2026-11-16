import * as THREE from 'three'
import { metricUVs } from '../../builders/uv'
import { sampleHeight } from '../../model/terrain'
import type { Project, Terrain, Vec2 } from '../../model/types'
import { useStore } from '../../store'
import { boundaryPointer, boundaryPreview } from '../../tools/plot-boundary'
import { brushRadiusFor } from '../../tools/brushState'
import { fencePointer, fencePreview } from '../../tools/fence'
import { ivyPointer } from '../../tools/ivy'
import { paintPointer } from '../../tools/ground-paint'
import { pathPointer, pathPreview } from '../../tools/path'
import { plantPointer } from '../../tools/plant-brush'
import { terrainPointer } from '../../tools/terrain-sculpt'
import { waterPointer, waterPreview } from '../../tools/water'
import { replaceSceneLayer, type SceneLayer, type SceneLayerContext, type SceneViewState } from '../layers'
import { distantGroundMode, groundMaterial } from './ground'
import { OutsideFeatures } from '../terrain/features'
import { GrassField } from '../terrain/grass'
import { PlantField } from '../terrain/plants'
import { qualityProfile } from '../render/quality'
import { useSettings } from '../../settings'
import { createSurround, type Surround } from '../terrain/surround'
import { createSplatMaterial, disposeSplatMaterial } from '../terrain/textures'

const OUTSIDE = new Set([
  'terrain-sculpt',
  'ground-paint',
  'water',
  'plant-brush',
  'fence',
  'plot-boundary',
  'path',
  'ivy',
])

function terrainGeometry(terrain: Terrain): THREE.BufferGeometry | null {
  const n = terrain.resolution
  const count = (n + 1) * (n + 1)
  if (n < 1 || terrain.width <= 0 || terrain.depth <= 0 || terrain.heights.length < count) return null
  const pos = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  for (let iy = 0; iy <= n; iy++) {
    for (let ix = 0; ix <= n; ix++) {
      const i = iy * (n + 1) + ix
      const h = terrain.heights[i]
      pos[i * 3] = -terrain.width / 2 + (ix / n) * terrain.width
      pos[i * 3 + 1] = Number.isFinite(h) ? h : 0
      pos[i * 3 + 2] = -terrain.depth / 2 + (iy / n) * terrain.depth
      uv[i * 2] = (ix + 0.5) / (n + 1)
      uv[i * 2 + 1] = (iy + 0.5) / (n + 1)
    }
  }
  const index = new Uint32Array(n * n * 6)
  let k = 0
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const a = iy * (n + 1) + ix
      index[k++] = a
      index[k++] = a + n + 1
      index[k++] = a + 1
      index[k++] = a + 1
      index[k++] = a + n + 1
      index[k++] = a + n + 2
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

function writeHeights(geo: THREE.BufferGeometry, terrain: Terrain): boolean {
  const pos = geo.getAttribute('position')
  const n = terrain.resolution
  const count = (n + 1) * (n + 1)
  if (!(pos instanceof THREE.BufferAttribute) || pos.count !== count || terrain.heights.length < count) return false
  for (let i = 0; i < count; i++) {
    const h = terrain.heights[i]
    pos.setY(i, Number.isFinite(h) ? h : 0)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return true
}

function flatGrass(): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; resize: (size: number) => void } {
  // Shared cached lawn (see groundMaterial): a clone would never get the scan.
  const material = groundMaterial()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.receiveShadow = true
  mesh.position.y = -0.02
  mesh.name = 'flat-ground'
  mesh.raycast = () => {}
  let size = 0
  const resize = (next: number) => {
    if (Math.abs(next - size) < 0.5 && size > 0) return
    size = next
    mesh.geometry.dispose()
    // Metric UVs, so the cloned map keeps the library's 1/tileSize repeat at any plane size.
    const geo = metricUVs(new THREE.PlaneGeometry(next, next))
    geo.rotateX(-Math.PI / 2)
    mesh.geometry = geo
  }
  resize(120)
  return { mesh, material, resize }
}

function draftPoints(tool: string): Vec2[] {
  if (tool === 'water') {
    const preview = waterPreview()
    if (preview.rect) return [...preview.rect, preview.rect[0]!].filter((p): p is Vec2 => !!p)
    return preview.hover ? [...preview.points, preview.hover] : preview.points
  }
  if (tool === 'fence') {
    const preview = fencePreview()
    return preview.hover ? [...preview.points, preview.hover] : preview.points
  }
  if (tool === 'path') {
    const preview = pathPreview()
    return preview.hover ? [...preview.points, preview.hover] : preview.points
  }
  if (tool === 'plot-boundary') {
    const preview = boundaryPreview()
    return preview.hover ? [...preview.points, preview.hover] : preview.points
  }
  return []
}

function dispatch(tool: string, phase: 'down' | 'move' | 'up', point: Vec2, shift: boolean, wallId: string | null): void {
  if (tool === 'terrain-sculpt') terrainPointer(phase, point)
  else if (tool === 'ground-paint') paintPointer(phase, point)
  else if (tool === 'plant-brush') plantPointer(phase, point, shift)
  else if (tool === 'water') waterPointer(phase, point)
  else if (tool === 'fence') fencePointer(phase, point)
  else if (tool === 'path') pathPointer(phase, point)
  else if (tool === 'plot-boundary') boundaryPointer(phase, point)
  else if (tool === 'ivy') ivyPointer(phase, point, shift, wallId)
}

function createOutsideGround(ctx: SceneLayerContext): SceneLayer {
  const flat = flatGrass()
  ctx.scene.add(flat.mesh)
  const surround: Surround = createSurround()
  ctx.scene.add(surround.group)
  const material = createSplatMaterial()
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  mesh.castShadow = true
  mesh.visible = false
  mesh.userData.kind = 'terrain'
  ctx.scene.add(mesh)

  const plants = new PlantField()
  ctx.scene.add(plants.group)
  const grass = new GrassField()
  ctx.scene.add(grass.mesh)
  const features = new OutsideFeatures()
  ctx.scene.add(features.group)

  const cursor = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0x3fb8af, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
  )
  cursor.rotation.x = -Math.PI / 2
  cursor.visible = false
  cursor.renderOrder = 4
  cursor.raycast = () => {}
  ctx.scene.add(cursor)

  const preview = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x3fb8af }),
  )
  preview.frustumCulled = false
  preview.raycast = () => {}
  preview.visible = false
  ctx.scene.add(preview)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()
  let painting = false
  let project: Project | null = null
  let view: SceneViewState | null = null
  let dirty = false
  let applied = false
  let lastApply = -1
  let grid = { resolution: -1, width: 0, depth: 0 }
  const canvas = ctx.renderer?.domElement ?? null

  const applyProject = (current: Project, state: SceneViewState) => {
    const terrain = current.terrain
    if (!terrain) return
    const mode = distantGroundMode(current.kind)
    const enabled = mode === 'meadow' && terrain.enabled !== false && terrain.resolution >= 1
    flat.mesh.visible = mode === 'meadow' && !enabled
    surround.group.visible = true
    try {
      surround.sync(terrain, mode)
    } catch (err) {
      console.error(err)
    }
    if (!enabled) {
      const plot = Math.max(terrain.width || 0, terrain.depth || 0, 16)
      flat.resize(Math.max(plot * 6, 120))
      mesh.visible = false
    } else {
      const sameGrid = grid.resolution === terrain.resolution && grid.width === terrain.width && grid.depth === terrain.depth
      if (!sameGrid || mesh.geometry.getAttribute('position') == null) {
        const geo = terrainGeometry(terrain)
        if (geo) {
          mesh.geometry.dispose()
          mesh.geometry = geo
          grid = { resolution: terrain.resolution, width: terrain.width, depth: terrain.depth }
        }
      } else {
        writeHeights(mesh.geometry, terrain)
      }
      material.userData.syncSplat?.(terrain)
      mesh.visible = mesh.geometry.getAttribute('position') != null
    }
    try {
      plants.sync(terrain)
      features.sync(current, state.levelDisplay, state.activeLevelId)
    } catch (err) {
      console.error(err)
    }
  }

  const groundPoint = (event: PointerEvent): Vec2 | null => {
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, ctx.camera)
    if (mesh.visible) {
      const hits = raycaster.intersectObject(mesh, false)
      const hit = hits[0]
      if (hit) return { x: hit.point.x, y: hit.point.z }
    }
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null
    return { x: hitPoint.x, y: hitPoint.z }
  }

  const wallPoint = (event: PointerEvent): { point: Vec2; wallId: string } | null => {
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, ctx.camera)
    const hits = raycaster.intersectObject(ctx.scene, true)
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        if (obj.userData.kind === 'wall' && typeof obj.userData.entityId === 'string') {
          return { point: { x: hit.point.x, y: hit.point.z }, wallId: obj.userData.entityId }
        }
        obj = obj.parent
      }
    }
    return null
  }

  const placeCursor = (point: Vec2 | null, tool: string) => {
    const radius = brushRadiusFor(tool)
    if (!point || radius == null) {
      cursor.visible = false
      return
    }
    const y = project?.terrain ? sampleHeight(project.terrain, point.x, point.y) : 0
    cursor.visible = true
    cursor.position.set(point.x, (Number.isFinite(y) ? y : 0) + 0.06, point.y)
    const scale = tool === 'path' ? Math.max(0.3, radius / 2) : radius
    cursor.scale.setScalar(Math.max(0.15, scale))
  }

  const placePreview = (tool: string) => {
    const points = draftPoints(tool)
    if (points.length < 2 || !project) {
      preview.visible = false
      return
    }
    const positions = new Float32Array(points.length * 3)
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      if (!point) continue
      const y = project.terrain ? sampleHeight(project.terrain, point.x, point.y) : 0
      positions[i * 3] = point.x
      positions[i * 3 + 1] = (Number.isFinite(y) ? y : 0) + 0.08
      positions[i * 3 + 2] = point.y
    }
    preview.geometry.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    preview.geometry = geo
    preview.visible = true
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !canvas) return
    const state = useStore.getState()
    if (!OUTSIDE.has(state.tool) || state.view === 'walk') return
    event.preventDefault()
    event.stopPropagation()
    painting = true
    if (ctx.controller.controls) ctx.controller.controls.enabled = false
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      /* the canvas may already have been released */
    }
    const wall = state.tool === 'ivy' ? wallPoint(event) : null
    const point = wall?.point ?? groundPoint(event)
    if (!point) return
    placeCursor(point, state.tool)
    dispatch(state.tool, 'down', point, event.shiftKey, wall?.wallId ?? null)
  }

  const onMove = (event: PointerEvent) => {
    const tool = useStore.getState().tool
    if (!OUTSIDE.has(tool)) {
      cursor.visible = false
      preview.visible = false
      return
    }
    const wall = tool === 'ivy' ? wallPoint(event) : null
    const point = wall?.point ?? groundPoint(event)
    placeCursor(point, tool)
    if (!point) return
    if (painting) {
      event.preventDefault()
      event.stopPropagation()
      dispatch(tool, 'move', point, event.shiftKey, wall?.wallId ?? null)
    } else {
      dispatch(tool, 'move', point, event.shiftKey, wall?.wallId ?? null)
    }
    placePreview(tool)
  }

  const onUp = (event: PointerEvent) => {
    if (!painting) return
    painting = false
    const tool = useStore.getState().tool
    const point = groundPoint(event) ?? { x: 0, y: 0 }
    dispatch(tool, 'up', point, event.shiftKey, null)
    if (ctx.controller.controls && useStore.getState().view !== 'walk') ctx.controller.controls.enabled = true
  }

  canvas?.addEventListener('pointerdown', onDown, true)
  canvas?.addEventListener('pointermove', onMove)
  canvas?.addEventListener('pointerup', onUp)
  canvas?.addEventListener('pointercancel', onUp)

  return {
    sync(next, state) {
      project = next
      view = state
      dirty = true
    },
    update(_dt, elapsed) {
      plants.update(elapsed, ctx.camera, ctx.renderer)
      if (project) {
        const tier = qualityProfile(useSettings.getState().graphicsQuality).grass
        grass.sync(project, distantGroundMode(project.kind), tier)
      }
      grass.update(ctx.camera)
      surround.update(ctx.camera)
      features.update(elapsed)
      if (!dirty || !project || !view) return
      if (applied && elapsed - lastApply < 0.032) return
      dirty = false
      applied = true
      lastApply = elapsed
      try {
        applyProject(project, view)
        placePreview(useStore.getState().tool)
      } catch (err) {
        console.error(err)
      }
    },
    dispose() {
      canvas?.removeEventListener('pointerdown', onDown, true)
      canvas?.removeEventListener('pointermove', onMove)
      canvas?.removeEventListener('pointerup', onUp)
      canvas?.removeEventListener('pointercancel', onUp)
      ctx.scene.remove(flat.mesh)
      flat.mesh.geometry.dispose()
      ctx.scene.remove(surround.group)
      surround.dispose()
      ctx.scene.remove(mesh)
      mesh.geometry.dispose()
      disposeSplatMaterial(material)
      plants.dispose()
      ctx.scene.remove(plants.group)
      ctx.scene.remove(grass.mesh)
      grass.dispose()
      features.dispose()
      ctx.scene.remove(features.group)
      ctx.scene.remove(cursor)
      cursor.geometry.dispose()
      const cursorMat = cursor.material
      if (!Array.isArray(cursorMat)) cursorMat.dispose()
      ctx.scene.remove(preview)
      preview.geometry.dispose()
      const previewMat = preview.material
      if (!Array.isArray(previewMat)) previewMat.dispose()
    },
  }
}

replaceSceneLayer('ground', {
  id: 'ground',
  create: createOutsideGround,
})
