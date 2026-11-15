/* eslint-disable @typescript-eslint/no-explicit-any -- TSL graphs and node classes are untyped in @types/three */
/**
 * Per-room reflection probes: the room the camera stands in, captured as a cube from its
 * middle, prefiltered to a PMREM and sampled box-projected (parallax-corrected against the
 * room's box) by interior materials in place of the outdoor sky.
 *
 * Interior library and model materials carry `roomEnvNode` as their `envNode` from the start,
 * so nothing recompiles when a room's capture lands, the camera walks into another room or
 * steps outside: only the node's texture and uniforms change. With no capture to show (Low,
 * WebGL, outdoors, before the first bake) it samples the scene's own environment the way
 * three would, so those views look as they did before probes.
 *
 * `|outdoor` material twins are clones, which do not copy `envNode`: exteriors keep the sky.
 */
import * as THREE from 'three'
import { cubeTexture, float, min, mix, normalWorld, positionWorld, step, uniform, vec3 } from 'three/tsl'
import { PROBE_LAYER } from './probeVolume'

/** Lamp shades and bulbs: too small for the irradiance captures, but a glossy floor shows them. */
export const REFLECTION_LAYER = 4

/** Size of every prefiltered reflection (three's PMREM works at 256 at least). */
export const REFLECTION_PMREM_SIZE = 256

/** Pixels this far outside the room's box still take its parallax correction (wall thickness). */
const BOX_MARGIN = 0.3

/**
 * Stand-in until the first environment exists. A plain cube with no images: the backend binds
 * its default cube for it. (Flagged as a render-target texture it was never created, and the
 * binding fell back to a 2D texture: "array layer range exceeds the texture's layer count".)
 */
const placeholder = new THREE.CubeTexture()

const envMap = cubeTexture(placeholder) as any
const maxLod = uniform(0)
const boxMin = uniform(new THREE.Vector3())
const boxMax = uniform(new THREE.Vector3())
const origin = uniform(new THREE.Vector3())
const boxOn = uniform(0)
const gain = uniform(1)

/** What the layer shows; null samples the scene environment (see RoomEnvNode.updateBefore). */
let shown: { texture: THREE.Texture; box: THREE.Box3; origin: THREE.Vector3; gain: number } | null = null

function mipCount(texture: THREE.Texture): number {
  const mipmaps = (texture as any).mipmaps as unknown[] | undefined
  return Array.isArray(mipmaps) && mipmaps.length > 0 ? mipmaps.length : 1
}

function bind(texture: THREE.Texture | null): void {
  const next = texture ?? placeholder
  if (envMap.value !== next) envMap.value = next
  maxLod.value = mipCount(next) - 1
}

/**
 * Box projection: the reflected ray from the fragment meets the room's box at `hit`; the
 * cube, captured at `origin`, is sampled toward that point instead of along the ray itself,
 * so a window or a lamp reflects where it stands in the room, not as if at infinity.
 */
function boxProjected(dir: any, pos: any): any {
  const sign = step(0, dir).mul(2).sub(1)
  const safe = dir.abs().max(1e-4).mul(sign)
  const wall = mix(boxMin, boxMax, step(0, dir))
  const t = wall.sub(pos).div(safe)
  const hit = min(t.x, min(t.y, t.z)).max(0)
  return pos.add(dir.mul(hit)).sub(origin)
}

function insideBox(pos: any): any {
  const lo = step(boxMin.sub(BOX_MARGIN), pos)
  const hi = step(pos, boxMax.add(BOX_MARGIN))
  const both = lo.mul(hi)
  return both.x.mul(both.y).mul(both.z)
}

/**
 * The environment a material reflects. EnvironmentNode builds it under a radiance context
 * (reflected direction, roughness as level) and an irradiance context (normal, level 1), the
 * same contract PMREMNode follows.
 */
class RoomEnvNode extends (THREE as any).Node {
  static get type(): string {
    return 'RoomEnvNode'
  }

  constructor() {
    super('vec3')
    this.updateBeforeType = (THREE as any).NodeUpdateType.RENDER
  }

  updateBefore(frame: any): void {
    if (shown) {
      bind(shown.texture)
      boxMin.value.copy(shown.box.min)
      boxMax.value.copy(shown.box.max)
      origin.value.copy(shown.origin)
      boxOn.value = 1
      gain.value = shown.gain
      return
    }
    bind(frame?.scene?.environment ?? null)
    boxOn.value = 0
    gain.value = 1
  }

  setup(builder: any): any {
    const ctx = builder.context
    const raw = ctx.getUV ? ctx.getUV(this, builder) : normalWorld
    const level = ctx.getTextureLevel ? ctx.getTextureLevel(this) : float(0)
    const rough = float(level).clamp()
    const dir = vec3(raw).normalize()
    // Rough lobes take the plain direction: the parallax of a blur is nothing, and box
    // projection of a wide lobe smears one wall over the whole room.
    const weight = boxOn.mul(insideBox(positionWorld)).mul(rough.oneMinus())
    const uv = mix(dir, boxProjected(dir, positionWorld).normalize(), weight)
    const mip = maxLod.mul(rough).mul(float(2).sub(rough))
    return envMap.sample(uv).level(mip).rgb.mul(gain)
  }
}

/** Shared by every interior material: one node, its texture swapped per room. */
export const roomEnvNode = new RoomEnvNode() as unknown as THREE.Node

/** Give an interior PBR material the room reflection. Outdoor twins are made without it. */
export function reflectRoom(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial & { envNode?: THREE.Node | null }
  if (!mat.isMeshStandardMaterial || mat.userData.outdoor) return
  mat.envNode = roomEnvNode
}

/** True when the material reflects the camera's room (see reflectRoom). */
export function hasRoomReflection(material: THREE.Material | null | undefined): boolean {
  return !!material && (material as { envNode?: unknown }).envNode === roomEnvNode
}

/**
 * Show a capture: interior glossy surfaces reflect `texture`, box-projected onto `box` from
 * `origin`. Null goes back to the scene environment (outdoors, no capture yet).
 */
export function showRoomReflection(next: { texture: THREE.Texture; box: THREE.Box3; origin: THREE.Vector3; gain: number } | null): void {
  shown = next
}

/** The capture on show (tests, perf overlay). */
export function shownRoomReflection(): THREE.Texture | null {
  return shown?.texture ?? null
}

/**
 * The capture cube and the prefiltered results. One cube target is shared by every slot (a
 * slot is captured face by face, then prefiltered into its own PMREM target); the PMREM
 * targets are made once per tier, so the materials only ever see a fixed set of textures.
 */
export class ReflectionPool {
  readonly cubeCamera: THREE.CubeCamera
  readonly capture: THREE.CubeRenderTarget
  readonly faceSize: number
  /** CPU ms of the last face capture and prefilter. */
  timing = { face: 0, prefilter: 0 }
  private readonly targets: (THREE.RenderTarget | null)[]
  private generator: THREE.PMREMGenerator | null = null

  constructor(slots: number, faceSize: number) {
    this.faceSize = faceSize
    this.capture = new (THREE as any).CubeRenderTarget(faceSize, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      // three keys render objects by attachment formats, not by target: without the stencil
      // this cube shares them with the irradiance batch target, and its array camera and our
      // plain one rebuilt every capture material each time the two bakes took turns.
      stencilBuffer: true,
    })
    this.cubeCamera = new THREE.CubeCamera(0.05, 1200, this.capture)
    this.cubeCamera.name = 'reflection-capture'
    for (const child of this.cubeCamera.children) {
      child.layers.set(PROBE_LAYER)
      child.layers.enable(REFLECTION_LAYER)
    }
    this.targets = new Array(slots).fill(null)
  }

  get slots(): number {
    return this.targets.length
  }

  /** The prefiltered texture of a slot, once it has one. */
  texture(slot: number): THREE.Texture | null {
    return this.targets[slot]?.texture ?? null
  }

  /** Render one cube face (0…5: +x, −x, +y, −y, +z, −z) from `at`. Scene lights must be in capture state. */
  captureFace(renderer: THREE.WebGPURenderer, scene: THREE.Scene, at: THREE.Vector3, face: number): void {
    const cube = this.cubeCamera
    const coordinateSystem = (renderer as any).coordinateSystem
    if ((cube as any).coordinateSystem !== coordinateSystem) {
      ;(cube as any).coordinateSystem = coordinateSystem
      cube.updateCoordinateSystem()
    }
    cube.position.copy(at)
    cube.updateMatrixWorld(true)
    const camera = cube.children[face] as THREE.Camera | undefined
    if (!camera) return
    const previous = renderer.getRenderTarget()
    const previousFace = renderer.getActiveCubeFace()
    const previousMip = renderer.getActiveMipmapLevel()
    const mrt = renderer.getMRT()
    const autoClear = renderer.autoClear
    const t0 = performance.now()
    try {
      // See ProbeBaker.capture: a scene pass's MRT left on the renderer empties the output.
      renderer.setMRT(null)
      renderer.autoClear = true
      renderer.setRenderTarget(this.capture, face, 0)
      renderer.render(scene, camera)
    } finally {
      renderer.autoClear = autoClear
      renderer.setRenderTarget(previous, previousFace, previousMip)
      renderer.setMRT(mrt)
    }
    this.timing.face = performance.now() - t0
  }

  /** Prefilter the captured cube into `slot`'s PMREM. */
  prefilter(renderer: THREE.WebGPURenderer, slot: number): THREE.Texture | null {
    if (slot < 0 || slot >= this.targets.length) return null
    this.generator ??= new THREE.PMREMGenerator(renderer)
    const previous = renderer.getRenderTarget()
    const mrt = renderer.getMRT()
    const t0 = performance.now()
    try {
      renderer.setMRT(null)
      const existing = this.targets[slot] ?? null
      const target = this.generator.fromCubemap(this.capture.texture, existing as any) as THREE.RenderTarget
      this.targets[slot] = target
    } finally {
      renderer.setRenderTarget(previous)
      renderer.setMRT(mrt)
    }
    this.timing.prefilter = performance.now() - t0
    return this.targets[slot]?.texture ?? null
  }

  dispose(): void {
    if (shown && this.targets.some((target) => target?.texture === shown?.texture)) shown = null
    for (const target of this.targets) target?.dispose()
    this.targets.fill(null)
    this.capture.dispose()
    this.generator?.dispose()
    this.generator = null
  }
}
