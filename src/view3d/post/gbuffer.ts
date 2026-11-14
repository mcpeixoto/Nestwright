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
  sample,
  vec4,
  velocity,
} from 'three/tsl'
import type { ColorNode, GBuffer, GBufferChannel, PassNode } from './registry'

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
 * | velocity   | rgba16f | NDC motion (xy)           | coverage |
 *
 * WebGPU guarantees 32 colour bytes per sample and rgba8 counts as 8, so these four are the
 * budget: metal/rough and albedo share one attachment.
 */
export function createScenePass(scene: THREE.Scene, camera: THREE.Camera, channels: ReadonlySet<GBufferChannel>): { scenePass: PassNode; gbuffer: GBuffer } {
  const scenePass = pass(scene, camera)
  const outputs: Record<string, THREE.Node> = { output }
  const cover = coverage()
  const wantMaterial = channels.has('metalRough') || channels.has('albedo')
  if (channels.has('normal')) outputs.normal = vec4(directionToColor(normalView), cover)
  if (wantMaterial) outputs.material = vec4(pbrMetalness(), pbrRoughness(), luminance(diffuseColor.rgb), cover)
  if (channels.has('velocity')) outputs.velocity = vec4(velocity as unknown as THREE.Node<'vec2'>, 0, cover)
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
  const gbuffer: GBuffer = {
    color: scenePass.getTextureNode('output') as unknown as GBuffer['color'],
    depth: scenePass.getTextureNode('depth'),
    normal: normalTex ? sample((uv) => colorToDirection(normalTex.sample(uv).rgb)) : null,
    velocity: channels.has('velocity') ? scenePass.getTextureNode('velocity') : null,
    metalRough: channels.has('metalRough') && material ? material : null,
    albedo: channels.has('albedo') && material ? (material.b as unknown as THREE.Node) : null,
  }
  return { scenePass, gbuffer }
}
