import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { BuildContext } from './types'

const FALLBACK = new THREE.MeshStandardMaterial({ color: '#c8c2b8', roughness: 0.7 })

export function matOf(ctx: BuildContext, slot: string): THREE.Material {
  return ctx.materials[slot] ?? FALLBACK
}

export function group(): THREE.Group {
  return new THREE.Group()
}

function prep(mesh: THREE.Mesh, slot: string): THREE.Mesh {
  mesh.userData.slot = slot
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Rounded box. Dimensions are the full extents; the mesh is centred on (x, y, z). */
export function roundedBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  radius = 0.008,
): THREE.Mesh {
  const ww = Math.max(w, 0.004)
  const hh = Math.max(h, 0.004)
  const dd = Math.max(d, 0.004)
  const r = Math.min(radius, ww / 2 - 1e-4, hh / 2 - 1e-4, dd / 2 - 1e-4)
  const geo = r > 0.003 ? new RoundedBoxGeometry(ww, hh, dd, 2, r) : new THREE.BoxGeometry(ww, hh, dd)
  const mesh = prep(new THREE.Mesh(geo, material), slot)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

export function cylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 12,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(Math.max(radius, 0.003), Math.max(radius, 0.003), Math.max(length, 0.004), segments)
  if (axis === 'x') geo.rotateZ(Math.PI / 2)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  const mesh = prep(new THREE.Mesh(geo, material), slot)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

/** Four legs of fixed radius. Outer faces stay inside the footprint. */
export function fourLegs(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  w: number,
  d: number,
  height: number,
  radius = 0.022,
): void {
  const h = Math.max(height, 0.01)
  const r = Math.min(radius, w * 0.18, d * 0.18, h / 2)
  const pad = Math.max(r, Math.min(0.08, w * 0.16, d * 0.16))
  const geos: THREE.BufferGeometry[] = []
  for (const x of [-w / 2 + pad, w / 2 - pad]) {
    for (const z of [-d / 2 + pad, d / 2 - pad]) {
      const geo = new THREE.CylinderGeometry(r, r, h, 8)
      geo.translate(x, h / 2, z)
      geos.push(geo)
    }
  }
  const merged = mergeGeometries(geos)
  for (const geo of geos) geo.dispose()
  if (!merged) return
  const mesh = prep(new THREE.Mesh(merged, material), slot)
  parent.add(mesh)
}

export function cylinderLeg(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  radius: number,
  height: number,
  x: number,
  z: number,
): THREE.Mesh {
  return cylinder(parent, material, slot, radius, height, x, height / 2, z, 'y', 10)
}

export function cushion(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  return roundedBox(parent, material, slot, w, h, d, x, y, z, Math.min(0.03, h * 0.4, w * 0.2))
}

export function panel(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  return roundedBox(parent, material, slot, w, h, d, x, y, z, 0.004)
}

export function handle(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  style: 'bar' | 'knob' | 'groove',
  x: number,
  y: number,
  z: number,
  vertical = true,
): void {
  if (style === 'knob') {
    const mesh = prep(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), material), slot)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return
  }
  if (style === 'groove') {
    roundedBox(parent, material, slot, vertical ? 0.012 : 0.12, vertical ? 0.1 : 0.012, 0.008, x, y, z, 0.002)
    return
  }
  cylinder(parent, material, slot, 0.008, vertical ? 0.12 : 0.14, x, y, z, vertical ? 'y' : 'x', 8)
}

export function torusRing(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  radius: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  flat = true,
): THREE.Mesh {
  const geo = new THREE.TorusGeometry(Math.max(radius, 0.01), Math.max(tube, 0.003), 8, 18)
  if (flat) geo.rotateX(Math.PI / 2)
  const mesh = prep(new THREE.Mesh(geo, material), slot)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

/** Profile is [radius, height] pairs. Scaled so the result fills w × h × d, sitting on y. */
export function lathe(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  profile: ReadonlyArray<readonly [number, number]>,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const pts = profile.map(([r, yy]) => new THREE.Vector2(Math.max(r, 0.001), yy))
  const geo = new THREE.LatheGeometry(pts, 16)
  geo.computeBoundingBox()
  const box = geo.boundingBox
  const rawH = Math.max(0.001, (box?.max.y ?? 1) - (box?.min.y ?? 0))
  const rawR = Math.max(0.001, Math.max(Math.abs(box?.min.x ?? 0.5), Math.abs(box?.max.x ?? 0.5)))
  geo.translate(0, -(box?.min.y ?? 0), 0)
  const mesh = prep(new THREE.Mesh(geo, material), slot)
  mesh.scale.set(w / (2 * rawR), h / rawH, d / (2 * rawR))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

/** Sphere scaled to a box of w × h × d, centred on (x, y, z). */
export function ellipsoid(
  parent: THREE.Object3D,
  material: THREE.Material,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = prep(new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), material), slot)
  mesh.scale.set(Math.max(w, 0.004), Math.max(h, 0.004), Math.max(d, 0.004))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

export function emissiveBox(
  parent: THREE.Object3D,
  color: string,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.85,
    roughness: 0.45,
  })
  material.userData.owned = true
  const mesh = roundedBox(parent, material, slot, w, h, d, x, y, z, 0.004)
  mesh.userData.shade = true
  return mesh
}

export function glassPane(
  parent: THREE.Object3D,
  source: THREE.Material,
  slot: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  opacity = 0.32,
): THREE.Mesh {
  const material = (source instanceof THREE.MeshStandardMaterial ? source : FALLBACK).clone()
  material.transparent = true
  material.opacity = opacity
  material.roughness = Math.max(material.roughness, 0.08)
  material.depthWrite = false
  material.userData.owned = true
  return roundedBox(parent, material, slot, w, h, d, x, y, z, 0.002)
}

const ENVELOPE = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
})

/** Invisible box so the group's bounds match `size` when the visible parts sit inside it. */
export function occupy(parent: THREE.Object3D, size: { w: number; d: number; h: number }): void {
  const w = Math.max(size.w, 0.001)
  const h = Math.max(size.h, 0.001)
  const d = Math.max(size.d, 0.001)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ENVELOPE)
  mesh.position.y = h / 2
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.raycast = () => {}
  mesh.userData.envelope = true
  parent.add(mesh)
}

export function markShade(mesh: THREE.Mesh): void {
  mesh.userData.shade = true
}

export function paramNum(params: BuildContext['params'], key: string, fallback: number): number {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
