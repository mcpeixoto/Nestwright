import * as THREE from 'three'
import {
  colorToDirection,
  diffuseColor,
  directionToColor,
  float,
  Fn,
  luminance,
  metalness,
  mrt,
  normalView,
  output,
  pass,
  roughness,
  getViewPosition,
  rtt,
  sample,
  uniform,
  uv,
  vec4,
} from 'three/tsl'
import type { ColorNode, GBuffer, GBufferChannel, PassNode } from './registry'

/**
 * Screen motion of the camera alone, reconstructed from depth in one full-screen pass.
 *
 * Why not three's per-object `velocity` MRT output: with a velocity attachment the renderer
 * gives every render object a full node/binding refresh every frame (NodeMaterialObserver
 * .needsVelocity), which measured ~7 ms of main-thread time a frame on the family template
 * (445 draws). The scene is static apart from swaying plants and a dragged item, so camera
 * motion is what TRAA needs to reproject; moving objects fall back on its variance clipping.
 *
 * Same convention as three's velocity: current NDC xy minus previous NDC xy, unjittered.
 */
export interface CameraMotion {
  /** Call once per frame before the pipeline renders (camera unjittered, matrices current). */
  update(camera: THREE.Camera): void
  /** Next frame reports zero motion (after a camera cut). */
  reset(): void
  texture: THREE.TextureNode
  dispose(): void
}

export function createCameraMotion(depth: THREE.TextureNode, camera: THREE.Camera): CameraMotion {
  const current = uniform(new THREE.Matrix4())
  const previous = uniform(new THREE.Matrix4())
  // Read live at render time, while TRAA has the projection jittered: the depth was drawn
  // with that projection, so the reconstruction matches it exactly.
  const projectionInverse = uniform(camera.projectionMatrixInverse)
  const cameraWorld = uniform(camera.matrixWorld)
  const motion = Fn(() => {
    const at = uv()
    const view = getViewPosition(at, depth.sample(at).r, projectionInverse)
    const world = cameraWorld.mul(vec4(view, 1))
    const now = current.mul(world)
    const before = previous.mul(world)
    return vec4(now.xy.div(now.w).sub(before.xy.div(before.w)), 0, 1)
  })
  const texture = rtt(motion(), null, null, { type: THREE.HalfFloatType }) as unknown as THREE.TextureNode
  let fresh = true
  return {
    update(cam) {
      previous.value.copy(current.value)
      current.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
      if (fresh) previous.value.copy(current.value)
      fresh = false
    },
    reset() {
      fresh = true
    },
    texture,
    dispose() {
      ;(texture as unknown as { dispose(): void }).dispose()
    },
  }
}

interface BuilderLike {
  material?: THREE.Material | null
}

/**
 * 1 for surfaces that belong in the G-buffer, 0 for the rest. Glass, clouds and other blended
 * surfaces that do not write depth write alpha 0, and the attachments blend with alpha, so they
 * leave the opaque surface behind them in place: AO and SSR then see the same surface the depth
 * buffer holds.
 */
const coverage = Fn((builder: BuilderLike) => {
  const material = builder.material
  return float(material && material.depthWrite !== false ? 1 : 0)
})

/** Roughness for lit PBR materials; 1 (never reflective) for basic, lambert and custom shading. */
const pbrRoughness = Fn((builder: BuilderLike) => {
  const material = builder.material as (THREE.Material & { roughness?: number }) | null | undefined
  return material && typeof material.roughness === 'number' ? roughness : float(1)
})

const pbrMetalness = Fn((builder: BuilderLike) => {
  const material = builder.material as (THREE.Material & { metalness?: number }) | null | undefined
  return material && typeof material.metalness === 'number' ? metalness : float(0)
})

/**
 * The single scene pass, with only the attachments some effect needs:
 *
 * | attachment | format  | rgb                       | a        |
 * |------------|---------|---------------------------|----------|
 * | output     | rgba16f | HDR colour                | alpha    |
 * | normal     | rgba8   | view normal (packed)      | coverage |
 * | material   | rgba8   | metalness, roughness, albedo luminance | coverage |
 *
 * WebGPU guarantees 32 colour bytes per sample and rgba8 counts as 8: metal/rough and albedo
 * share one attachment. `velocity` is not an attachment: it is camera motion reconstructed
 * from depth afterwards (see createCameraMotion).
 */
export function createScenePass(
  scene: THREE.Scene,
  camera: THREE.Camera,
  channels: ReadonlySet<GBufferChannel>,
): { scenePass: PassNode; gbuffer: GBuffer; motion: CameraMotion | null } {
  const scenePass = pass(scene, camera)
  const outputs: Record<string, THREE.Node> = { output }
  const cover = coverage()
  const wantMaterial = channels.has('metalRough') || channels.has('albedo')
  if (channels.has('normal')) outputs.normal = vec4(directionToColor(normalView), cover)
  if (wantMaterial) outputs.material = vec4(pbrMetalness(), pbrRoughness(), luminance(diffuseColor.rgb), cover)
  if (Object.keys(outputs).length > 1) {
    const targets = mrt(outputs)
    for (const name of Object.keys(outputs)) {
      if (name !== 'output') targets.setBlendMode(name, new THREE.BlendMode(THREE.NormalBlending))
    }
    scenePass.setMRT(targets)
    for (const name of ['normal', 'material']) {
      if (outputs[name]) scenePass.getTexture(name).type = THREE.UnsignedByteType
    }
  }
  const normalTex = channels.has('normal') ? scenePass.getTextureNode('normal') : null
  const material = wantMaterial ? (scenePass.getTextureNode('material') as unknown as ColorNode) : null
  const depth = scenePass.getTextureNode('depth')
  const motion = channels.has('velocity') ? createCameraMotion(depth, camera) : null
  const gbuffer: GBuffer = {
    color: scenePass.getTextureNode('output') as unknown as GBuffer['color'],
    depth,
    normal: normalTex ? sample((uv) => colorToDirection(normalTex.sample(uv).rgb)) : null,
    velocity: motion ? motion.texture : null,
    metalRough: channels.has('metalRough') && material ? material : null,
    albedo: channels.has('albedo') && material ? (material.b as unknown as THREE.Node) : null,
  }
  return { scenePass, gbuffer, motion }
}
