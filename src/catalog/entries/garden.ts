import * as THREE from 'three'
import { part, tube } from '../geom'
import { registerEntries } from '../registry'
import type { BuildContext, CatalogEntry } from '../types'

function fountain(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group()
  const stone = ctx.materials.stone ?? new THREE.MeshStandardMaterial({ color: '#cfc6b8' })
  const water = ctx.materials.water ?? new THREE.MeshStandardMaterial({ color: '#7ec8d4', transparent: true, opacity: 0.8 })
  const { w, d, h } = ctx.size
  const basinH = Math.min(0.42, h * 0.38)
  part(group, stone, w, basinH * 0.35, d, 0, basinH * 0.18, 0, 0.04)
  part(group, stone, w * 0.86, basinH * 0.55, d * 0.86, 0, basinH * 0.55, 0, 0.02)
  part(group, water, w * 0.72, 0.04, d * 0.72, 0, basinH * 0.78, 0, 0)
  tube(group, stone, Math.min(w, d) * 0.06, h - basinH, 0, basinH + (h - basinH) / 2, 0, 8)
  const count = 36
  const positions = new Float32Array(count * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: '#e7f7f8', size: 0.045, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  points.frustumCulled = false
  const jet = h - basinH
  points.onBeforeRender = () => {
    const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000
    for (let i = 0; i < count; i++) {
      const phase = (t * 0.85 + i / count) % 1
      const spread = phase * phase
      positions[i * 3] = Math.sin(i * 2.17) * 0.12 * spread
      positions[i * 3 + 1] = basinH + jet * 0.92 * (1 - phase)
      positions[i * 3 + 2] = Math.cos(i * 1.73) * 0.12 * spread
    }
    const attr = geo.getAttribute('position')
    if (attr) attr.needsUpdate = true
  }
  group.add(points)
  return group
}

const entry: CatalogEntry = {
  id: 'fountain',
  name: 'Fountain',
  category: 'outdoor',
  tags: ['water', 'garden'],
  defaultSize: { w: 1.4, d: 1.4, h: 1.35 },
  price: 640,
  materialSlots: { stone: { id: 'concrete' }, water: { id: 'glass' } },
  build: fountain,
}

registerEntries([entry])
