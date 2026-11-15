import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import { levelRooms, openingTrim, type OpeningTrim } from '../model/trim'
import type { Level, MaterialRef, Opening, Room, Wall } from '../model/types'
import { sampleFrame, wallFrame } from '../model/walls'
import { chamferBox, extrude, prism, Sheet, sweep, vec3, type PathFrame, type ProfilePoint } from './trim'
import { metricUVs } from './uv'
import { TRIM_PAINT } from './walls'

let windowGlassMat: THREE.MeshStandardMaterial | null = null

function windowGlass(): THREE.MeshStandardMaterial {
  if (!windowGlassMat) {
    windowGlassMat = getMaterial({ id: 'glass' }).clone()
    windowGlassMat.userData.windowGlass = true
    windowGlassMat.emissive = new THREE.Color('#000000')
  }
  return windowGlassMat
}

const SILL_STONE: MaterialRef = { id: 'travertine' }

function tag(obj: THREE.Object3D, opening: Opening) {
  obj.traverse((child) => {
    child.userData.entityId = opening.id
    child.userData.kind = 'opening'
    child.userData.openingType = opening.type
    const mesh = child as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = mesh.material !== undefined && !(mesh.material as THREE.Material).transparent
      mesh.receiveShadow = true
    }
  })
}

/** Sheets keyed by material; each becomes one mesh. */
class Parts {
  private readonly sheets = new Map<THREE.Material, Sheet>()

  of(material: THREE.Material): Sheet {
    let sheet = this.sheets.get(material)
    if (!sheet) {
      sheet = new Sheet()
      this.sheets.set(material, sheet)
    }
    return sheet
  }

  addTo(parent: THREE.Object3D): void {
    for (const [material, sheet] of this.sheets) {
      const mesh = sheet.mesh(material)
      if (mesh) parent.add(mesh)
    }
  }
}

export interface OpeningBuildContext {
  level?: Level
  rooms?: readonly Room[]
}

/** Painted openings take white trim; timber and metal frames carry their own material. */
function trimRef(frame: MaterialRef): MaterialRef {
  return frame.id === 'plaster-white' ? TRIM_PAINT : frame
}

/**
 * Architrave round an opening on the face at z = side·T/2. `bottom` is where the legs stop (the
 * floor, or the top of a window stool); null runs it round all four sides, mitred.
 */
function casing(sheet: Sheet, w: number, h: number, faceZ: number, side: 1 | -1, bottom: number | null, width = 0.065, proud = 0.02): void {
  const o = vec3(0, 0, side)
  const closed = bottom === null
  const y0 = bottom ?? 0
  const path: PathFrame[] = [
    { p: vec3(-w / 2, y0, faceZ), s: closed ? vec3(-1, -1, 0) : vec3(-1, 0, 0), o },
    { p: vec3(-w / 2, h, faceZ), s: vec3(-1, 1, 0), o },
    { p: vec3(w / 2, h, faceZ), s: vec3(1, 1, 0), o },
    { p: vec3(w / 2, y0, faceZ), s: closed ? vec3(1, -1, 0) : vec3(1, 0, 0), o },
  ]
  if (closed) path.push({ ...path[0]! })
  // Across the casing from the opening edge (a) and out from the wall (b): a flat face with an
  // eased outer edge and a small round on the inner one.
  const profile: ProfilePoint[] = [
    [0, 0],
    [width, 0],
    [width, proud - 0.006],
    [width - 0.008, proud],
    [0.005, proud],
    [0, proud - 0.004],
    [0, 0],
  ]
  sweep(sheet, path, profile, { skip: [0] })
}

/**
 * Opening meshes sit in the hole the wall builder left.
 * Local frame: origin at the sill centre, +x along the wall, +y up, +z through the wall
 * (towards the wall's left side).
 */
export function buildOpening(opening: Opening, wall: Wall, elevation: number, ctx: OpeningBuildContext = {}): THREE.Group {
  const group = new THREE.Group()
  const at = sampleFrame(wallFrame(wall), opening.offset)
  group.position.set(at.point.x, elevation + opening.sill, at.point.y)
  group.rotation.y = Math.atan2(-at.tangent.y, at.tangent.x)

  const rooms = ctx.rooms ?? (ctx.level ? levelRooms(ctx.level) : [])
  const info = openingTrim(opening, wall, rooms)
  const w = opening.width
  const h = opening.height
  const T = Math.max(wall.thickness, 0.08)
  const depth = T
  const frameMat = getMaterial(opening.frame)
  const casingMat = getMaterial(trimRef(opening.frame))
  const leafMat = getMaterial(opening.frame.id === 'plaster-white' ? { id: 'oak-planks' } : opening.frame)
  const metal = getMaterial({ id: 'metal-black' })
  const brass = getMaterial({ id: 'metal-brass' })
  const border = Math.min(0.06, w * 0.08, h * 0.08)
  const hinge = opening.flipHinge ? 1 : -1
  const side = opening.flipSide ? 1 : -1
  const parts = new Parts()

  /** Door lining: jambs and head across the full reveal, chamfered. */
  const lining = (sill = false) => {
    const sheet = parts.of(frameMat)
    chamferBox(sheet, border, h, depth, -w / 2 + border / 2, h / 2, 0)
    chamferBox(sheet, border, h, depth, w / 2 - border / 2, h / 2, 0)
    chamferBox(sheet, w - border * 2, border, depth, 0, h - border / 2, 0)
    if (sill) chamferBox(sheet, w - border * 2, border, depth, 0, border / 2, 0)
  }
  const caseFaces = (bottom: number) => {
    for (const s of [1, -1] as const) {
      if (s === 1 ? info.casing.left : info.casing.right) casing(parts.of(casingMat), w, h, (s * T) / 2, s, bottom)
    }
  }

  const kind = opening.type
  if (kind === 'window' || kind === 'fixed-window' || kind === 'tall-window' || kind === 'corner-window') {
    buildWindow(parts, opening, info, T, frameMat, casingMat)
  } else if (kind === 'round-window') {
    const radius = Math.min(w, h) / 2
    const shape = new THREE.Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(w / 2, h)
    shape.lineTo(-w / 2, h)
    shape.closePath()
    const hole = new THREE.Path()
    hole.absarc(0, h / 2, Math.max(0.05, radius - border), 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    geo.translate(0, 0, -depth / 2)
    group.add(new THREE.Mesh(geo, getMaterial(wall.left)))
    const ring = new THREE.Mesh(metricUVs(new THREE.TorusGeometry(radius - border / 2, border / 2, 8, 24)), frameMat)
    ring.position.set(0, h / 2, 0)
    group.add(ring)
    const disk = new THREE.Mesh(metricUVs(new THREE.CircleGeometry(Math.max(0.05, radius - border), 24)), windowGlass())
    disk.position.set(0, h / 2, 0)
    group.add(disk)
  } else if (kind === 'sliding-door') {
    lining()
    caseFaces(0)
    const panelW = w / 2 + 0.04
    const panelH = h - border
    const glass = parts.of(windowGlass())
    const bars = parts.of(metal)
    for (const [x, z] of [
      [-w / 4, side * 0.02],
      [w / 4, -side * 0.02],
    ] as const) {
      const fw = 0.05
      chamferBox(bars, fw, panelH, 0.04, x - panelW / 2 + fw / 2, panelH / 2, z, 0.002)
      chamferBox(bars, fw, panelH, 0.04, x + panelW / 2 - fw / 2, panelH / 2, z, 0.002)
      chamferBox(bars, panelW - fw * 2, fw, 0.04, x, panelH - fw / 2, z, 0.002)
      chamferBox(bars, panelW - fw * 2, 0.08, 0.04, x, 0.04, z, 0.002)
      chamferBox(glass, panelW - fw * 2, panelH - fw - 0.08, 0.012, x, (panelH - fw + 0.08) / 2, z, 0)
    }
  } else if (kind === 'garage-door') {
    lining()
    const rows = 4
    const gap = 0.015
    const panelH = (h - border - gap * (rows - 1)) / rows
    const sheet = parts.of(metal)
    for (let i = 0; i < rows; i++) {
      const y = border * 0.2 + panelH / 2 + i * (panelH + gap)
      chamferBox(sheet, w - border * 2, panelH, 0.04, 0, y, side * 0.01, 0.006)
    }
  } else if (kind === 'arch') {
    const spring = h * 0.62
    const shape = new THREE.Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(w / 2, h)
    shape.lineTo(-w / 2, h)
    shape.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-w / 2 + border, 0)
    hole.lineTo(-w / 2 + border, spring)
    hole.absarc(0, spring, w / 2 - border, Math.PI, 0, true)
    hole.lineTo(w / 2 - border, 0)
    hole.closePath()
    shape.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: depth * 0.5, bevelEnabled: false })
    geo.translate(0, 0, -depth * 0.25)
    group.add(new THREE.Mesh(geo, frameMat))
  } else {
    // Single and double doors: lining, architraves, panelled leaves with lever handles.
    lining()
    caseFaces(0)
    const leaves = kind === 'double-door' ? 2 : 1
    const leafW = (w - border * 2) / leaves - 0.01
    const leafH = h - border - 0.01
    const leafD = 0.04
    for (let i = 0; i < leaves; i++) {
      const hingeSign = leaves === 1 ? hinge : i === 0 ? -1 : 1
      const hingeX = hingeSign * (w / 2 - border)
      const pivot = new THREE.Group()
      pivot.position.set(hingeX, 0, 0)
      pivot.userData.doorLeaf = opening.id
      pivot.userData.hingeSign = hingeSign
      buildLeaf(pivot, leafMat, brass, leafW, leafH, leafD, -hingeSign, side * 0.012)
      group.add(pivot)
    }
  }

  parts.addTo(group)
  tag(group, opening)
  return group
}

/**
 * A door leaf in its pivot's frame (hinge at x = 0): a chamfered slab with two raised panels on
 * each face and a lever handle on both sides. `toward` is the direction from the hinge to the
 * lock edge.
 */
function buildLeaf(pivot: THREE.Group, leafMat: THREE.Material, brass: THREE.Material, leafW: number, leafH: number, leafD: number, toward: number, z: number): void {
  const wood = new Sheet()
  const metal = new Sheet()
  const cx = toward * (leafW / 2)
  const y0 = 0.005
  chamferBox(wood, leafW, leafH, leafD, cx, y0 + leafH / 2, z, 0.003)
  const margin = Math.min(0.11, leafW * 0.16)
  const panelW = leafW - margin * 2
  const rail = leafH * 0.56
  const panels: [number, number][] = [
    [0.14, rail - 0.06],
    [rail + 0.06, leafH - margin],
  ]
  for (const face of [1, -1]) {
    for (const [p0, p1] of panels) {
      if (p1 - p0 < 0.1 || panelW < 0.1) continue
      chamferBox(wood, panelW, p1 - p0, 0.008, cx, y0 + (p0 + p1) / 2, z + face * (leafD / 2), 0.0035)
    }
    // Lever: a round rose, a short neck, and the lever pointing back to the hinge.
    const hx = toward * (leafW - 0.065)
    const hy = 1.0
    const fz = z + face * (leafD / 2)
    prism(metal, vec3(hx, hy, fz), vec3(hx, hy, fz + face * 0.01), 0.026, 12, true)
    prism(metal, vec3(hx, hy, fz + face * 0.01), vec3(hx, hy, fz + face * 0.05), 0.009, 8)
    chamferBox(metal, 0.13, 0.018, 0.02, hx - toward * 0.055, hy, fz + face * 0.055, 0.005)
  }
  const woodMesh = wood.mesh(leafMat)
  if (woodMesh) pivot.add(woodMesh)
  const metalMesh = metal.mesh(brass)
  if (metalMesh) pivot.add(metalMesh)
}

/**
 * Window with a profiled frame set back in the reveal: an outer frame, a sash per pane with a
 * glazing bead, and the glass. Inside: architrave and a stool with an apron under it. Outside:
 * a stone sill with a drip groove. Reveals are the wall's own faces.
 */
function buildWindow(parts: Parts, opening: Opening, info: OpeningTrim, T: number, frameMat: THREE.Material, casingMat: THREE.Material): void {
  const w = opening.width
  const h = opening.height
  const inside = info.interior
  const outside = -inside
  const fd = Math.min(0.07, T * 0.6)
  const fw = Math.min(0.055, w * 0.08, h * 0.08)
  // Outer reveal of 50 mm when the wall is thick enough; the rest is the inside reveal.
  const zc = inside === 0 ? 0 : outside * Math.max(0, T / 2 - 0.05 - fd / 2)
  const frame = parts.of(frameMat)
  chamferBox(frame, fw, h, fd, -w / 2 + fw / 2, h / 2, zc)
  chamferBox(frame, fw, h, fd, w / 2 - fw / 2, h / 2, zc)
  chamferBox(frame, w - fw * 2, fw, fd, 0, h - fw / 2, zc)
  chamferBox(frame, w - fw * 2, fw, fd, 0, fw / 2, zc)
  const panes = opening.type === 'fixed-window' ? 1 : opening.type === 'tall-window' ? 3 : 2
  const mw = fw * 0.8
  const innerW = w - fw * 2
  const paneW = (innerW - mw * (panes - 1)) / panes
  const glass = parts.of(windowGlass())
  const toRoom = inside === 0 ? 1 : inside
  const fixed = opening.type === 'fixed-window'
  for (let i = 0; i < panes; i++) {
    const x0 = -innerW / 2 + i * (paneW + mw)
    const cx = x0 + paneW / 2
    if (i > 0) chamferBox(frame, mw, h - fw * 2, fd, x0 - mw / 2, h / 2, zc)
    let gw = paneW
    let gh = h - fw * 2
    let gz = zc
    if (!fixed) {
      // Sash, a little proud of the frame on the room side.
      const sw = Math.min(0.045, paneW * 0.2)
      const sd = fd * 0.72
      const sz = zc + toRoom * (fd - sd) * 0.5 + toRoom * 0.006
      chamferBox(frame, sw, gh, sd, cx - paneW / 2 + sw / 2, h / 2, sz, 0.004)
      chamferBox(frame, sw, gh, sd, cx + paneW / 2 - sw / 2, h / 2, sz, 0.004)
      chamferBox(frame, paneW - sw * 2, sw, sd, cx, fw + sw / 2, sz, 0.004)
      chamferBox(frame, paneW - sw * 2, sw, sd, cx, h - fw - sw / 2, sz, 0.004)
      gw = paneW - sw * 2
      gh = gh - sw * 2
      gz = sz
    }
    // Glazing bead on the room side of the glass.
    const bead = 0.014
    const bz = gz + toRoom * 0.012
    const by = h / 2
    chamferBox(frame, bead, gh, 0.014, cx - gw / 2 + bead / 2, by, bz, 0.003)
    chamferBox(frame, bead, gh, 0.014, cx + gw / 2 - bead / 2, by, bz, 0.003)
    chamferBox(frame, gw - bead * 2, bead, 0.014, cx, by - gh / 2 + bead / 2, bz, 0.003)
    chamferBox(frame, gw - bead * 2, bead, 0.014, cx, by + gh / 2 - bead / 2, bz, 0.003)
    chamferBox(glass, gw, gh, 0.008, cx, by, gz, 0)
  }

  const stool = opening.sill >= 0.3 && inside !== 0
  const trim = parts.of(casingMat)
  const cw = 0.06
  for (const s of [1, -1] as const) {
    if (!(s === 1 ? info.casing.left : info.casing.right)) continue
    // Legs stand on the stool, or run to the floor beside floor-length glazing.
    const bottom = stool && s === inside ? 0.004 : opening.sill < 0.3 ? -opening.sill : null
    casing(trim, w, h, (s * T) / 2, s, bottom, cw, 0.018)
  }
  if (stool) {
    const U = vec3(0, 0, inside)
    const V = vec3(0, 1, 0)
    const X = vec3(1, 0, 0)
    const back = inside * zc + fd / 2
    const front = T / 2 + 0.035
    const horn = cw + 0.02
    const board: ProfilePoint[] = [
      [back, -0.025],
      [front, -0.025],
      [front, 0],
      [front - 0.004, 0.004],
      [back, 0.004],
    ]
    extrude(trim, board, vec3(-w / 2 - horn, 0, 0), U, V, X, w + horn * 2)
    const apron: ProfilePoint[] = [
      [T / 2 - 0.002, -0.025 - 0.07],
      [T / 2 + 0.012, -0.025 - 0.07],
      [T / 2 + 0.014, -0.025 - 0.068],
      [T / 2 + 0.014, -0.025],
      [T / 2 - 0.002, -0.025],
    ]
    extrude(trim, apron, vec3(-w / 2 - cw, 0, 0), U, V, X, w + cw * 2)
  }
  if (inside !== 0 && opening.sill >= 0.2) {
    const U = vec3(0, 0, outside)
    const V = vec3(0, 1, 0)
    const X = vec3(1, 0, 0)
    const back = outside * zc + fd / 2 - 0.004
    const front = T / 2 + 0.05
    const t = 0.04
    const sill: ProfilePoint[] = [
      [back, 0.004 - t],
      [front - 0.024, 0.004 - t],
      [front - 0.024, 0.004 - t + 0.008],
      [front - 0.016, 0.004 - t + 0.008],
      [front - 0.016, 0.004 - t],
      [front, 0.004 - t],
      [front, -0.01],
      [front - 0.004, -0.007],
      [back, 0.004],
    ]
    extrude(parts.of(getMaterial(SILL_STONE)), sill, vec3(-w / 2 - 0.04, 0, 0), U, V, X, w + 0.08)
  }
}
