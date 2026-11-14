import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { metricUVs } from '../builders/uv'

export function part(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  radius = 0.012,
): THREE.Mesh {
  const ww = Math.max(w, 0.01)
  const hh = Math.max(h, 0.01)
  const dd = Math.max(d, 0.01)
  const r = Math.min(radius, ww / 2 - 1e-4, hh / 2 - 1e-4, dd / 2 - 1e-4)
  const geo = metricUVs(r > 0.004 ? new RoundedBoxGeometry(ww, hh, dd, 2, r) : new THREE.BoxGeometry(ww, hh, dd))
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

export function tube(
  parent: THREE.Object3D,
  mat: THREE.Material,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  segments = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    metricUVs(new THREE.CylinderGeometry(Math.max(radius, 0.005), Math.max(radius, 0.005), Math.max(height, 0.01), segments)),
    mat,
  )
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

export function legs(parent: THREE.Object3D, mat: THREE.Material, w: number, d: number, legH: number, inset = 0.06) {
  const xs = [-w / 2 + inset, w / 2 - inset]
  const zs = [-d / 2 + inset, d / 2 - inset]
  for (const x of xs) {
    for (const z of zs) part(parent, mat, 0.05, legH, 0.05, x, legH / 2, z, 0.008)
  }
}
