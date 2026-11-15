/* eslint-disable @typescript-eslint/no-explicit-any -- TSL graphs below are untyped in @types/three (Loop, array, ivec2 loads) */
/**
 * Irradiance probe volumes for bounce light, baked on the GPU.
 *
 * Adapted from three.js r187 `examples/jsm/lighting/LightProbeGrid.js` and
 * `examples/jsm/tsl/lighting/LightProbeGridNode.js` (MIT, © three.js authors): the SH
 * projection, the seven-sub-volume atlas and its sampling are theirs. What changed, and why:
 *
 * - The bake is split into steps a frame can afford (capture a few batches of probes) and a
 *   final repack, instead of one call that stalls for the whole grid.
 * - The lights in a capture are the scene's own, so the capture pipelines compile once and
 *   are reused on every rebake: no internal bounce grid joining the scene, no hiding of the
 *   volume being baked, no forced re-render of every shadow map per call (the caller swaps
 *   the cascaded sun for a fitted one and renders its map once per bake).
 * - Bounces come from feedback: a capture sees the volumes' previous result, so each rebake
 *   adds one more bounce.
 * - Inside its box the volume replaces the hemisphere and environment fill instead of adding
 *   to it (`replace`), so corners away from windows get darker and walls next to a sunlit
 *   floor pick up its colour, instead of every room getting the same open-sky fill.
 * - The atlas texture is a node value updated per render, so a re-sized grid swaps targets
 *   without recompiling the materials that sample it.
 */
import * as THREE from 'three'
import {
  array,
  atan,
  float,
  Fn,
  getShIrradianceAt,
  If,
  int,
  ivec2,
  Loop,
  luminance,
  mix,
  normalWorld,
  positionWorld,
  renderGroup,
  screenCoordinate,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import type { ProbeResolution } from '../../model/probeGrid'

/**
 * The layer probe captures see: the surfaces that carry bounce light (structure, ground, sky,
 * furniture of some size) and every light. Small decor, plants and trees are left out; at
 * 8–12 px a cube face they would be a pixel each and they were most of a capture's draws.
 */
export const PROBE_LAYER = 3

/** Share of the bounce light's chroma that reaches surfaces (1 = all of it). */
export const PROBE_SATURATION = 0.5

/**
 * Share of a material's environment reflection that takes the local probe irradiance indoors:
 * 0 for glossy (roughness ≤ 0.25, keeps the env map and SSR), 1 for matt (≥ 0.7), smooth between.
 */
export function roughShare(roughness: number): number {
  if (!Number.isFinite(roughness)) return 0
  const t = Math.min(1, Math.max(0, (roughness - 0.25) / (0.7 - 0.25)))
  return t * t * (3 - 2 * t)
}

/** Probes captured per render: six 90° sub-cameras each. */
export const PROBES_PER_BATCH = 8
/** Row blocks per face, so each probe's projection spreads over more fragments. */
const FACE_BLOCKS = 4
/** Padding slices at both ends of every atlas sub-volume (copies of the edge slice). */
const ATLAS_PADDING = 1

const FACE_FORWARD = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
const FACE_RIGHT = [[0, 0, 1], [0, 0, -1], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [1, 0, 0]] as const
const FACE_UP = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]] as const

const T = { array, atan, float, Fn, int, ivec2, Loop, screenCoordinate, vec3, vec4 } as Record<string, any>

// ---------------------------------------------------------------------------- the light

/**
 * One level's probe grid, as a light. Volumes are created once per graphics tier and stay in
 * the scene (moving and re-baking only), so the light set — and the compiled materials — do
 * not change when levels or rooms do.
 */
export class ProbeVolume extends THREE.Light {
  readonly isProbeVolume = true
  /** The world box the grid covers; probes sit at its cell centres. */
  readonly boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(-1e5 + 1, -1e5 + 1, -1e5 + 1))
  readonly resolution = new THREE.Vector3(2, 2, 2)
  /** 0 adds the volume's irradiance to the fill lights, 1 replaces them inside the box. */
  replace = 0
  /** Probes per axis the atlas has room for; a grid uses the low corner of it. */
  readonly capacity: ProbeResolution
  /** The SH atlas the materials sample. Allocated once and rebaked in place. */
  readonly atlas: THREE.RenderTarget3D

  constructor(capacity: ProbeResolution) {
    super(0xffffff, 0)
    ;(this as { type: string }).type = 'ProbeVolume'
    this.capacity = { ...capacity }
    this.atlas = createAtlas(capacity)
  }

  /** Point the volume at a finished bake's grid size and box (the atlas holds its data). */
  install(res: ProbeResolution, box: THREE.Box3): void {
    this.resolution.set(res.x, res.y, res.z)
    this.boundingBox.copy(box)
  }

  /** Park the volume: no level to light. */
  park(): void {
    this.intensity = 0
    this.boundingBox.set(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(-1e5 + 1, -1e5 + 1, -1e5 + 1))
  }

  dispose(): void {
    this.atlas.dispose()
    super.dispose()
  }
}

/** The atlas for a grid: seven RGBA sub-volumes (nine L2 SH coefficients) stacked along Z. */
export function createAtlas(res: ProbeResolution): THREE.RenderTarget3D {
  const target = new THREE.RenderTarget3D(res.x, res.y, 7 * (res.z + 2 * ATLAS_PADDING), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
  return target
}

// ---------------------------------------------------------------------------- the light node

/** A 1×1×1 stand-in so the node has a 3D texture to bind before the first bake lands. */
const placeholder = new THREE.Data3DTexture(new Uint16Array(4), 1, 1, 1)
placeholder.format = THREE.RGBAFormat
placeholder.type = THREE.HalfFloatType
placeholder.needsUpdate = true

/**
 * `uvw` is in grid units (0…1 over the probes in use); `capacity` is the atlas's probe room,
 * so x and y scale into the used corner and z into the used slices of each sub-volume.
 */
function evaluateIrradiance(atlas: any, uvw: any, res: any, capacity: any, normal: any): any {
  const paddedSlices = capacity.z.add(2 * ATLAS_PADDING)
  const atlasDepth = paddedSlices.mul(7)
  const uvZBase = uvw.z.mul(res.z).add(ATLAS_PADDING)
  const xy = uvw.xy.mul(res.xy).div(capacity.xy)
  const slice = (t: number) => atlas.sample(vec3(xy, uvZBase.add(paddedSlices.mul(t)).div(atlasDepth)))
  const s0 = slice(0)
  const s1 = slice(1)
  const s2 = slice(2)
  const s3 = slice(3)
  const s4 = slice(4)
  const s5 = slice(5)
  const s6 = slice(6)
  const sh = array([
    s0.xyz,
    vec3(s0.w, s1.xy),
    vec3(s1.zw, s2.x),
    s2.yzw,
    s3.xyz,
    vec3(s3.w, s4.xy),
    vec3(s4.zw, s5.x),
    s5.yzw,
    s6.xyz,
  ] as any)
  return (getShIrradianceAt as any)(normal, sh).max(vec3(0))
}

interface ProbeContext {
  irradiance: any
  weight: any
}

/**
 * Samples the volume at the fragment and hands the lighting context its irradiance. Where
 * several volumes overlap the last one built wins (they never overlap: one per level).
 *
 * three adds `context.lightProbeIrradiance` to the irradiance after every light node has run
 * (LightsNode.setupLights). Handing it `probe − weight × irradiance` instead of `probe` turns
 * that add into a blend that replaces the fill gathered so far (hemisphere light), and the
 * environment's diffuse share is scaled down in the same expression's statement position.
 */
class ProbeVolumeNode extends (THREE as any).AnalyticLightNode {
  static get type(): string {
    return 'ProbeVolumeNode'
  }

  private readonly min = uniform(new THREE.Vector3())
  private readonly max = uniform(new THREE.Vector3())
  private readonly res = uniform(new THREE.Vector3(2, 2, 2))
  private readonly capacity = uniform(new THREE.Vector3(2, 2, 2))
  private readonly gain = (uniform(0) as any).setGroup(renderGroup)
  private readonly replaceBy = (uniform(0) as any).setGroup(renderGroup)
  private readonly atlasNode: any

  constructor(light: ProbeVolume | null = null) {
    super(light)
    this.updateType = (THREE as any).NodeUpdateType.RENDER
    // The atlas is fixed for the volume's life, so it is bound once, at build.
    this.atlasNode = texture3D(light ? light.atlas.texture : placeholder)
  }

  update(): void {
    const light = (this as any).light as ProbeVolume
    this.min.value.copy(light.boundingBox.min)
    this.max.value.copy(light.boundingBox.max)
    this.res.value.copy(light.resolution)
    this.capacity.value.set(light.capacity.x, light.capacity.y, light.capacity.z)
    this.gain.value = light.intensity
    this.replaceBy.value = light.intensity > 0 ? light.replace : 0
  }

  setup(builder: any): void {
    const min = this.min as any
    const max = this.max as any
    const res = this.res as any
    const range = max.sub(min)
    const spacing = range.div(res)
    // Sample half a cell along the normal (the probes see the surface, not its inside).
    const samplePos = positionWorld.add(normalWorld.mul(spacing).mul(0.5))
    const margin = spacing.mul(0.01)
    const inside = samplePos.greaterThanEqual(min.sub(margin)).all().and(samplePos.lessThanEqual(max.add(margin)).all())
    const ctx = builder.context
    let probe: ProbeContext | undefined = ctx.nwProbe
    if (!probe) {
      probe = { irradiance: vec3(0).toVar('nwProbeIrradiance'), weight: float(0).toVar('nwProbeWeight') }
      ctx.nwProbe = probe
      const hemi = ctx.irradiance
      const ibl = ctx.iblIrradiance
      // Only PBR materials have a roughness (Lambert and basic shading do not). The material's
      // scalar is read here, at build time: the per-pixel `roughness` node is not set up in
      // every pass that builds lights, and reading it there broke pipelines (empty output).
      const rough = typeof builder.material?.roughness === 'number' ? roughShare(builder.material.roughness) : 0
      const specular = rough > 0 ? ctx.radiance : null
      const blend = probe
      // Built where LightsNode adds it, after every light: scale the image-based fill down
      // as a side statement, then return the term that turns `irradiance +=` into a blend.
      // The environment's specular lobe is the open sky too: on rough surfaces (plaster,
      // fabric, matt wood) it was a grey sheen over the whole room. Indoors their rough
      // reflection takes the local irradiance instead (E/π, the radiance of a uniform
      // surround); glossy surfaces keep the environment map and SSR.
      ctx.lightProbeIrradiance = Fn(() => {
        if (ibl) ibl.mulAssign(float(1).sub(blend.weight))
        if (specular) specular.assign(mix(specular, blend.irradiance.mul(1 / Math.PI), blend.weight.mul(rough)))
        return blend.irradiance.sub(hemi.mul(blend.weight))
      })()
    }
    const uvwHalf = vec3(0.5).div(res)
    If(inside, () => {
      const uvw = samplePos.sub(min).div(range).clamp(uvwHalf, uvwHalf.oneMinus())
      const irradiance = evaluateIrradiance(this.atlasNode, uvw, res, this.capacity, normalWorld)
      // Bounce keeps part of its colour only: at 8–12 px a face one strongly coloured surface
      // (the underside of a tiled roof over a room with no ceiling) tints a whole room.
      const grey = luminance(irradiance)
      probe.irradiance.assign(mix(vec3(grey), irradiance, PROBE_SATURATION).mul(this.gain))
      probe.weight.assign(this.replaceBy)
    })
  }
}

;(ProbeVolume as any).registerNode(ProbeVolumeNode)

// ---------------------------------------------------------------------------- the baker

function projectSHNode(faces: any, size: number, batchStart: any): any {
  return T.Fn(() => {
    const column = T.int(T.screenCoordinate.x)
    const block = column.mod(FACE_BLOCKS)
    const coefIndex = column.div(6 * FACE_BLOCKS).toVar()
    const face = column.div(FACE_BLOCKS).mod(6).toVar()
    const slot = T.int(T.screenCoordinate.y).sub(batchStart)
    const rows = size / FACE_BLOCKS
    const rowStart = block.mul(rows).toVar()
    const forward = T.array(FACE_FORWARD.map((v) => T.vec3(...v))).element(face).toVar()
    const right = T.array(FACE_RIGHT.map((v) => T.vec3(...v))).element(face).toVar()
    const up = T.array(FACE_UP.map((v) => T.vec3(...v))).element(face).toVar()
    const origin = T.ivec2(face.mul(size), slot.mul(size).add(rowStart)).toVar()
    const texelSize = 2 / size
    const accum = T.vec3(0).toVar()
    const area = (x: any, y: any) => T.atan(x.mul(y).div(x.mul(x).add(y.mul(y)).add(1).sqrt()))
    T.Loop(size, rows, ({ i, j }: { i: any; j: any }) => {
      const x0 = T.float(i).mul(texelSize).sub(1)
      const x1 = x0.add(texelSize)
      const y0 = T.float(1).sub(T.float(j.add(rowStart)).mul(texelSize))
      const y1 = y0.sub(texelSize)
      const solidAngle = area(x0, y0).sub(area(x0, y1)).sub(area(x1, y0)).add(area(x1, y1)).abs()
      const x = x0.add(texelSize * 0.5)
      const y = y0.sub(texelSize * 0.5)
      const dir = forward.add(right.mul(x)).add(up.mul(y)).normalize().toVar()
      const radiance = faces.load(origin.add(T.ivec2(i, j))).rgb
      const dx = dir.x
      const dy = dir.y
      const dz = dir.z
      const basis = T.array([
        T.float(0.282095),
        dy.mul(0.488603),
        dz.mul(0.488603),
        dx.mul(0.488603),
        dx.mul(dy).mul(1.092548),
        dy.mul(dz).mul(1.092548),
        dz.mul(dz).mul(3).sub(1).mul(0.315392),
        dx.mul(dz).mul(1.092548),
        dx.mul(dx).sub(dy.mul(dy)).mul(0.546274),
      ]).element(coefIndex)
      accum.addAssign(radiance.mul(basis.mul(solidAngle)))
    })
    return T.vec4(accum, 1)
  })()
}

function repackNode(batch: any, textureIndex: number, resolution: any, sliceZ: any): any {
  return T.Fn(() => {
    const ix = T.int(T.screenCoordinate.x)
    const iy = T.int(T.screenCoordinate.y)
    const nx = T.int(resolution.x)
    const nz = T.int(resolution.z)
    const probeIndex = ix.add(sliceZ.mul(nx)).add(iy.mul(nx).mul(nz)).toVar()
    const c = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
      let sum = batch.load(T.ivec2(k * 6 * FACE_BLOCKS, probeIndex))
      for (let b = 1; b < 6 * FACE_BLOCKS; b++) sum = sum.add(batch.load(T.ivec2(k * 6 * FACE_BLOCKS + b, probeIndex)))
      return sum
    })
    const [c0, c1, c2, c3, c4, c5, c6, c7, c8] = c as any[]
    switch (textureIndex) {
      case 0:
        return T.vec4(c0.xyz, c1.x)
      case 1:
        return T.vec4(c1.yz, c2.xy)
      case 2:
        return T.vec4(c2.z, c3.xyz)
      case 3:
        return T.vec4(c4.xyz, c5.x)
      case 4:
        return T.vec4(c5.yz, c6.xy)
      case 5:
        return T.vec4(c6.z, c7.xyz)
      default:
        return T.vec4(c8.xyz, 0)
    }
  })()
}

export interface BakeJob {
  res: ProbeResolution
  box: THREE.Box3
  /** Capture position of probe `index` (cell centre, moved out of walls). */
  positions: THREE.Vector3[]
  atlas: THREE.RenderTarget3D
}

/**
 * Shared bake resources: one capture camera (8 probes × 6 faces), the face atlas, the SH
 * batch target and the projection and repack materials. Created once per renderer.
 */
export class ProbeBaker {
  readonly camera: THREE.ArrayCamera
  /** CPU ms of the last capture's scene render and SH projection (perf diagnostics). */
  timing = { scene: 0, project: 0 }
  private faceTarget: THREE.RenderTarget
  /** Cube face size, fixed for the baker's life (a new size gets a new baker). */
  readonly faceSize: number
  private batchTarget: THREE.RenderTarget | null = null
  private batchRows = 0
  private readonly quad: THREE.QuadMesh = new (THREE.QuadMesh as any)()
  private readonly faceNode = texture(new THREE.Texture())
  private readonly batchNode = texture(new THREE.Texture())
  private readonly batchStart = uniform(0, 'int')
  private readonly resolutionNode = uniform(new THREE.Vector3())
  private readonly sliceZ = uniform(0, 'int')
  private shMaterial: THREE.NodeMaterial
  private readonly repack: THREE.NodeMaterial[] = []

  constructor(faceSize: number, near = 0.1, far = 1000) {
    const cameras: THREE.PerspectiveCamera[] = []
    for (let i = 0; i < PROBES_PER_BATCH * 6; i++) {
      const camera = new THREE.PerspectiveCamera(90, 1, near, far)
      ;(camera as any).viewport = new THREE.Vector4()
      const up = FACE_UP[i % 6] ?? FACE_UP[0]
      camera.up.set(up[0], up[1], up[2])
      cameras.push(camera)
    }
    this.camera = new THREE.ArrayCamera(cameras)
    this.camera.layers.set(PROBE_LAYER)
    ;(this.camera as any).perCameraFrustumCulled = true
    this.faceSize = faceSize
    this.faceTarget = this.createFaceTarget(faceSize)
    this.shMaterial = this.createShMaterial(faceSize)
    for (let t = 0; t < 7; t++) {
      const material = new THREE.NodeMaterial()
      material.outputNode = repackNode(this.batchNode, t, this.resolutionNode, this.sliceZ)
      material.depthTest = false
      material.depthWrite = false
      this.repack.push(material)
    }
  }

  /** The render target captures draw into; the precompile renders against the same format. */
  get target(): THREE.RenderTarget {
    return this.faceTarget
  }

  private createFaceTarget(size: number): THREE.RenderTarget {
    const target = new THREE.RenderTarget(6 * size, PROBES_PER_BATCH * size, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    })
    this.camera.cameras.forEach((camera, i) => {
      ;(camera as any).viewport.set((i % 6) * size, Math.floor(i / 6) * size, size, size)
    })
    this.faceNode.value = target.texture
    return target
  }

  private createShMaterial(size: number): THREE.NodeMaterial {
    const material = new THREE.NodeMaterial()
    material.outputNode = projectSHNode(this.faceNode, size, this.batchStart)
    material.depthTest = false
    material.depthWrite = false
    return material
  }

  private ensureBatch(rows: number): THREE.RenderTarget {
    if (!this.batchTarget || this.batchRows !== rows) {
      this.batchTarget?.dispose()
      this.batchTarget = new THREE.RenderTarget(9 * 6 * FACE_BLOCKS, rows, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
      })
      this.batchRows = rows
      this.batchNode.value = this.batchTarget.texture
    }
    return this.batchTarget
  }

  /** Point every sub-camera of the capture camera at probe slots (or at `fallback` when idle). */
  aim(positions: readonly THREE.Vector3[], start: number, count: number): void {
    const target = new THREE.Vector3()
    for (let slot = 0; slot < PROBES_PER_BATCH; slot++) {
      const p = slot < count ? positions[start + slot] : undefined
      for (let face = 0; face < 6; face++) {
        const camera = this.camera.cameras[slot * 6 + face]
        if (!camera) continue
        if (p) {
          camera.layers.set(PROBE_LAYER)
          camera.position.copy(p)
          const f = FACE_FORWARD[face] ?? FACE_FORWARD[0]
          camera.lookAt(target.set(p.x + f[0], p.y + f[1], p.z + f[2]))
          camera.updateMatrixWorld()
        } else {
          // Idle slots draw nothing; the camera count stays fixed.
          camera.layers.disableAll()
        }
      }
    }
  }

  /**
   * Capture probes [start, start + count) of `job` (at most PROBES_PER_BATCH) and project them
   * into the SH batch rows. The scene's lights must already be in their capture state.
   */
  capture(renderer: THREE.WebGPURenderer, scene: THREE.Scene, job: BakeJob, start: number, limit = PROBES_PER_BATCH): number {
    const total = job.res.x * job.res.y * job.res.z
    const count = Math.min(PROBES_PER_BATCH, Math.max(1, limit), total - start)
    if (count <= 0) return 0
    const batch = this.ensureBatch(total)
    this.aim(job.positions, start, count)
    const autoClear = renderer.autoClear
    const previous = renderer.getRenderTarget()
    const mrt = renderer.getMRT()
    try {
      // A scene pass's MRT left on the renderer would build these pipelines with no colour
      // output (its names match none of our targets' textures): "structures must have at
      // least one member".
      renderer.setMRT(null)
      renderer.autoClear = true
      renderer.setRenderTarget(this.faceTarget)
      const t0 = performance.now()
      renderer.render(scene, this.camera)
      const t1 = performance.now()
      renderer.autoClear = false
      this.batchStart.value = start
      batch.viewport.set(0, start, 9 * 6 * FACE_BLOCKS, count)
      renderer.setRenderTarget(batch)
      this.quad.material = this.shMaterial
      this.quad.render(renderer)
      this.timing = { scene: t1 - t0, project: performance.now() - t1 }
    } finally {
      renderer.autoClear = autoClear
      renderer.setRenderTarget(previous)
      renderer.setMRT(mrt)
    }
    return count
  }

  /**
   * Pack every captured row of `job` into the low corner of its atlas (sized for `capacity`
   * probes per axis), padding slices included.
   */
  pack(renderer: THREE.WebGPURenderer, job: BakeJob, capacity: ProbeResolution): void {
    const { x: nx, y: ny, z: nz } = job.res
    this.resolutionNode.value.set(nx, ny, nz)
    const atlas = job.atlas
    const padded = capacity.z + 2 * ATLAS_PADDING
    const autoClear = renderer.autoClear
    const previous = renderer.getRenderTarget()
    const mrt = renderer.getMRT()
    try {
      renderer.setMRT(null)
      renderer.autoClear = false
      atlas.viewport.set(0, 0, nx, ny)
      for (let iz = 0; iz < nz; iz++) {
        this.sliceZ.value = iz
        for (let t = 0; t < 7; t++) {
          const material = this.repack[t]
          if (!material) continue
          this.quad.material = material
          const base = t * padded
          const layers = [base + ATLAS_PADDING + iz]
          if (iz === 0) layers.push(base)
          if (iz === nz - 1) layers.push(base + ATLAS_PADDING + nz)
          for (const layer of layers) {
            renderer.setRenderTarget(atlas, layer)
            this.quad.render(renderer)
          }
        }
      }
    } finally {
      renderer.autoClear = autoClear
      renderer.setRenderTarget(previous)
      renderer.setMRT(mrt)
    }
  }

  dispose(): void {
    this.faceTarget.dispose()
    this.batchTarget?.dispose()
    this.shMaterial.dispose()
    for (const material of this.repack) material.dispose()
  }
}
