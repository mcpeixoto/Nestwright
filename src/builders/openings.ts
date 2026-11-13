import * as THREE from 'three'
import { getMaterial } from '../materials/materialCache'
import type { Opening, Wall } from '../model/types'
import { sampleFrame, wallFrame } from '../model/walls'

let windowGlassMat: THREE.MeshStandardMaterial | null = null

function windowGlass(): THREE.MeshStandardMaterial {
  if (!windowGlassMat) {
    windowGlassMat = getMaterial({ id: 'glass' }).clone()
    windowGlassMat.userData.windowGlass = true
    windowGlassMat.emissive = new THREE.Color('#000000')
  }
  return windowGlassMat
}

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

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), mat)
  mesh.position.set(x, y, z)
  return mesh
}

function glassPane(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  return box(windowGlass(), w, h, d, x, y, z)
}

/**
 * Opening meshes sit in the hole the wall builder left.
 * Local frame: origin at the sill centre, +x along the wall, +y up, +z through the wall.
 */
export function buildOpening(opening: Opening, wall: Wall, elevation: number): THREE.Group {
  const group = new THREE.Group()
  const at = sampleFrame(wallFrame(wall), opening.offset)
  group.position.set(at.point.x, elevation + opening.sill, at.point.y)
  group.rotation.y = Math.atan2(-at.tangent.y, at.tangent.x)

  const w = opening.width
  const h = opening.height
  const depth = Math.max(wall.thickness, 0.08)
  const frameMat = getMaterial(opening.frame)
  const leafMat = getMaterial(opening.frame.id === 'plaster-white' ? { id: 'oak-planks' } : opening.frame)
  const metal = getMaterial({ id: 'metal-black' })
  const brass = getMaterial({ id: 'metal-brass' })
  const border = Math.min(0.06, w * 0.08, h * 0.08)
  const hinge = opening.flipHinge ? 1 : -1
  const side = opening.flipSide ? 1 : -1

  const addFrame = (leaf = true) => {
    group.add(box(frameMat, border, h, depth, -w / 2 + border / 2, h / 2, 0))
    group.add(box(frameMat, border, h, depth, w / 2 - border / 2, h / 2, 0))
    group.add(box(frameMat, w, border, depth, 0, h - border / 2, 0))
    if (!leaf && opening.sill > 0.02) group.add(box(frameMat, w, border, depth, 0, border / 2, 0))
  }

  const kind = opening.type
  if (kind === 'window' || kind === 'fixed-window' || kind === 'tall-window' || kind === 'corner-window') {
    addFrame(false)
    group.add(box(frameMat, w, border, depth * 0.6, 0, border / 2, 0))
    const mullions = kind === 'tall-window' ? 2 : 1
    for (let i = 1; i <= mullions; i++) {
      const x = -w / 2 + (w * i) / (mullions + 1)
      group.add(box(frameMat, 0.03, h - border * 2, 0.03, x, h / 2, 0))
    }
    group.add(glassPane(w - border * 2, h - border * 2, 0.012, 0, h / 2, 0))
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
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius - border / 2, border / 2, 8, 24), frameMat)
    ring.position.set(0, h / 2, 0)
    group.add(ring)
    const disk = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.05, radius - border), 24), windowGlass())
    disk.position.set(0, h / 2, 0)
    group.add(disk)
  } else if (kind === 'sliding-door') {
    addFrame(true)
    const panelW = w / 2 + 0.04
    const panelH = h - border
    group.add(glassPane(panelW - 0.06, panelH - 0.08, 0.015, -w / 4, panelH / 2, side * 0.015))
    group.add(glassPane(panelW - 0.06, panelH - 0.08, 0.015, w / 4, panelH / 2, -side * 0.015))
    group.add(box(metal, panelW, 0.04, 0.03, -w / 4, panelH / 2, side * 0.02))
    group.add(box(metal, panelW, 0.04, 0.03, w / 4, panelH / 2, -side * 0.02))
  } else if (kind === 'garage-door') {
    addFrame(true)
    const rows = 4
    const gap = 0.015
    const panelH = (h - border - gap * (rows - 1)) / rows
    for (let i = 0; i < rows; i++) {
      const y = border * 0.2 + panelH / 2 + i * (panelH + gap)
      group.add(box(metal, w - border * 2, panelH, 0.04, 0, y, side * 0.01))
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
    // single and double doors: a frame plus leaf panels
    addFrame(true)
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
      const leafCenter = -hingeSign * (leafW / 2)
      pivot.add(box(leafMat, leafW, leafH, leafD, leafCenter, leafH / 2 + 0.005, side * 0.012))
      pivot.add(box(leafMat, leafW * 0.72, leafH * 0.55, 0.012, leafCenter, leafH * 0.42, side * (0.012 + leafD / 2)))
      pivot.add(box(brass, 0.02, 0.12, 0.04, leafCenter * 1.4, h * 0.48, side * 0.05))
      group.add(pivot)
    }
  }

  tag(group, opening)
  return group
}
