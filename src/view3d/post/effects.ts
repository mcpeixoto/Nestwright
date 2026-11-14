import * as THREE from 'three'
import { float, luminance, min, mix, rtt, smoothstep, uniform, vec4 } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { ssr } from 'three/addons/tsl/display/SSRNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import type { GraphicsQuality } from '../../settings'
import type { QualityProfile } from '../render/quality'
import { registerDisplayEffect, registerPostEffect, type ColorNode, type FloatNode } from './registry'

// Linear HDR luminance before tone mapping. Sunlit white plaster reaches ~2–3, so a lower
// threshold makes every wall glow; lamps and fire are emissive well above this.
const BLOOM_THRESHOLD = 4

/**
 * Occlusion should dim indirect light only. One scene pass has no separate indirect term, so
 * it is estimated as albedo × AO_INDIRECT_CAP, capped by the pixel's own colour: a surface lit
 * only by sky and bounce (colour below the cap) is darkened by the full AO, a sunlit one only
 * by the AO of its small indirect share. Linear HDR radiance per unit albedo.
 */
export const aoIndirectCap = uniform(0.5)
/** 0 disables occlusion, 1 is the full GTAO/SSGI value. */
export const aoStrength = uniform(1)
/** 0 disables screen-space reflections, 1 is the physical weight. */
export const ssrStrength = uniform(1)

/**
 * SSR weight for non-metals. The node multiplies by its own angle ramp (0 head-on, 1 at
 * grazing), so the product stays near dielectric F0 (0.04) at the angles a floor is seen at.
 */
const SSR_DIELECTRIC = 0.06
/** Roughness range over which reflections fade out; rougher surfaces keep the env-map lobe only. */
const SSR_ROUGH_START = 0.12
const SSR_ROUGH_END = 0.35
/**
 * World-normal y range over which SSR fades in. Only floors, worktops and table tops trace
 * rays: ceilings and undersides never should, and on walls and thin vertical metal the
 * half-resolution march showed stair-stepped blocks, so they keep the env-map reflection.
 */
const SSR_UP_START = 0.35
const SSR_UP_END = 0.7

export const dofFocus = uniform(8)
export const dofFocalLength = uniform(4)
export const dofBokehScale = uniform(1)

/** Darken `color` by `occlusion`, applied to the estimated indirect light only (see aoIndirectCap). */
function occlude(color: ColorNode, occlusion: FloatNode, albedo: THREE.Node): ColorNode {
  const amount = float(1).sub(occlusion).mul(aoStrength).clamp(0, 1)
  // Share of the pixel's radiance that is (estimated) indirect; scaling the whole colour by it
  // keeps the hue.
  const indirectShare = min(float(1), (albedo as FloatNode).mul(aoIndirectCap).div(luminance(color.rgb).max(1e-4)))
  return vec4(color.rgb.mul(float(1).sub(amount.mul(indirectShare))), color.a) as unknown as ColorNode
}

/**
 * Per-tier cost knobs, read when the chain is built (a rebuild picks up changes). GTAO and its
 * denoise dominate the frame at full resolution, so every tier traces it at reduced resolution
 * and lets the edge-aware denoise upsample. SSR at full resolution measured ~85 ms a frame on
 * an M-series GPU (its march length grows with resolution), so it stays at half on Ultra too.
 */
export const postTuning = {
  gtaoResolution: { low: 0.5, medium: 0.5, high: 0.4, ultra: 0.4 } as Record<GraphicsQuality, number>,
  gtaoSamples: { low: 8, medium: 8, high: 12, ultra: 12 } as Record<GraphicsQuality, number>,
  denoiseRadius: { low: 8, medium: 8, high: 6, ultra: 6 } as Record<GraphicsQuality, number>,
  ssrResolution: { low: 0.5, medium: 0.5, high: 0.5, ultra: 0.5 } as Record<GraphicsQuality, number>,
  ssrQuality: { low: 0.4, medium: 0.4, high: 0.3, ultra: 0.35 } as Record<GraphicsQuality, number>,
  /**
   * SSGI is wired but off. Measured on Ultra (M-series, 1440p ×2): +5–6 ms a frame at half
   * resolution, and its AO term dimmed open sunlit facade plaster by 14 sRGB (limit 12). Phase 3
   * (probe grid + SSGI) retunes it; Ultra runs the High chain at full render scale until then.
   */
  ssgi: false,
}

function ssgiRuns(profile: QualityProfile): boolean {
  return profile.effects.ssgi && postTuning.ssgi
}

function gtaoScale(profile: QualityProfile): number {
  return postTuning.gtaoResolution[profile.tier] ?? 0.5
}

registerPostEffect({
  id: 'gtao',
  order: 100,
  needs: ['normal', 'albedo'],
  // When SSGI runs it supplies the occlusion term too.
  enabled: (profile) => profile.effects.gtao && !ssgiRuns(profile),
  apply: (color, input) => {
    const { gbuffer, camera, profile } = input
    if (!gbuffer.normal || !gbuffer.albedo) return color
    const node = ao(gbuffer.depth, gbuffer.normal, camera)
    node.resolutionScale = gtaoScale(profile)
    // Metres. Contact shadow under a sofa or in a room corner, not a dark ring around the room.
    node.radius.value = 1
    node.thickness.value = 1
    // Exponent on the AO term: GTAO alone reads faint at room scale.
    node.scale.value = 1.6
    node.samples.value = postTuning.gtaoSamples[profile.tier] ?? 8
    // A fixed sample pattern, removed spatially. Rotating it per frame for TRAA left visible
    // grain on walls and fabric: the resolve's variance clipping keeps half-res noise.
    node.useTemporalFiltering = false
    input.disposables.push(node)
    const aoTex = node.getTextureNode()
    // Edge-aware filter, run once into a target at the AO's own resolution: inline in the
    // full-resolution composite it cost as much as GTAO itself.
    const filtered = denoise(aoTex, gbuffer.depth, gbuffer.normal, camera)
    filtered.radius.value = postTuning.denoiseRadius[profile.tier] ?? 6
    const baked = rtt(filtered, null, null, { resolutionScale: gtaoScale(profile) })
    input.disposables.push(filtered, baked)
    return occlude(color, (baked as unknown as ColorNode).r as unknown as FloatNode, gbuffer.albedo)
  },
})

registerPostEffect({
  id: 'ssr',
  order: 200,
  needs: ['normal', 'metalRough'],
  enabled: (profile) => profile.effects.ssr,
  apply: (color, input) => {
    const { gbuffer, camera, profile } = input
    if (!gbuffer.normal || !gbuffer.metalRough) return color
    const metalRough = gbuffer.metalRough as unknown as ColorNode
    const metal = metalRough.r as unknown as FloatNode
    const rough = metalRough.g as unknown as FloatNode
    const gloss = float(1).sub(smoothstep(SSR_ROUGH_START, SSR_ROUGH_END, rough))
    // The node renders on a full-screen quad, so read the scene camera's matrix directly.
    const cameraWorld = uniform(camera.matrixWorld)
    const worldNormalY = cameraWorld.mul(vec4(gbuffer.normal as THREE.Node<'vec3'>, 0)).y
    const facesUp = smoothstep(SSR_UP_START, SSR_UP_END, worldNormalY)
    const reflectance = mix(float(SSR_DIELECTRIC), float(1), metal).mul(gloss).mul(facesUp).mul(ssrStrength) as unknown as FloatNode
    const node = ssr(gbuffer.color, gbuffer.depth as FloatNode, gbuffer.normal as THREE.Node<'vec3'>, {
      metalnessNode: reflectance,
      roughnessNode: rough,
      reflectNonMetals: true,
      camera,
    })
    node.resolutionScale = postTuning.ssrResolution[profile.tier] ?? 0.5
    // Metres from the reflecting plane; a room's far wall, not the whole street.
    node.maxDistance.value = 8
    node.thickness.value = 0.08
    node.quality.value = postTuning.ssrQuality[profile.tier] ?? 0.4
    node.maxLuminance.value = 6
    input.disposables.push(node)
    // Where a ray hits, the traced reflection replaces the env-map reflection the lit colour
    // already holds instead of adding to it: the base keeps (1 - weight) of itself. A miss
    // (black result) leaves the env-map lobe untouched.
    const reflection = (node as unknown as ColorNode).rgb
    const hit = smoothstep(0.0005, 0.01, luminance(reflection))
    const keep = float(1).sub(reflectance.mul(hit))
    return vec4(color.rgb.mul(keep).add(reflection), color.a) as unknown as ColorNode
  },
})

registerPostEffect({
  id: 'ssgi',
  order: 300,
  needs: ['normal', 'albedo'],
  enabled: (profile) => ssgiRuns(profile),
  apply: (color, input) => {
    const { gbuffer, camera } = input
    if (!gbuffer.normal || !gbuffer.albedo || !(camera instanceof THREE.PerspectiveCamera)) return color
    const node = ssgi(gbuffer.color, gbuffer.depth, gbuffer.normal, camera)
    node.resolutionScale = 0.5
    node.sliceCount.value = 2
    node.stepCount.value = 8
    node.radius.value = 3
    node.thickness.value = 0.6
    node.giIntensity.value = 1.5
    node.aoIntensity.value = 1
    node.useTemporalFiltering = input.profile.effects.traa
    input.disposables.push(node)
    // Albedo luminance only (the G-buffer budget): bounce light keeps its source's tint, not
    // the receiver's.
    const albedo = gbuffer.albedo as FloatNode
    const occluded = occlude(color, node.getAONode() as unknown as FloatNode, gbuffer.albedo)
    const gi = node.getGINode() as unknown as ColorNode
    return vec4(occluded.rgb.add(albedo.mul(gi.rgb)), color.a) as unknown as ColorNode
  },
})

registerPostEffect({
  id: 'bloom',
  order: 500,
  enabled: (profile) => profile.effects.bloom,
  apply: (color, input) => {
    const node = bloom(color, 0.18, 0.32, BLOOM_THRESHOLD)
    input.disposables.push(node)
    return color.add(node) as ColorNode
  },
})

registerPostEffect({
  id: 'dof',
  order: 600,
  enabled: (_profile, photo) => photo,
  apply: (color, input) => {
    const node = dof(color, input.scenePass.getViewZNode(), dofFocus, dofFocalLength, dofBokehScale)
    input.disposables.push(node)
    return node as unknown as ColorNode
  },
})

interface TraaInternals {
  beautyNode?: { dispose?: () => void }
  setSize?: (width: number, height: number) => void
}

/**
 * TRAANode has no reset method. Its updateBefore restarts the history from the current frame
 * whenever the history size differs from the beauty buffer, so shrinking it through the public
 * setSize() is the reset. This is the one place that relies on that; check it on three upgrades.
 */
function resetTraaHistory(node: TraaInternals): void {
  node.setSize?.(1, 1)
}

registerDisplayEffect({
  id: 'traa',
  order: 800,
  needs: ['velocity'],
  enabled: (profile) => profile.effects.traa,
  apply: (color, input) => {
    const { gbuffer, camera } = input
    if (!gbuffer.velocity) return color
    const node = traa(color, gbuffer.depth as THREE.TextureNode, gbuffer.velocity as THREE.TextureNode, camera)
    const internals = node as unknown as TraaInternals
    input.disposables.push(node)
    // traa() wraps the display colour in its own render target; free it with the chain.
    const beauty = internals.beautyNode
    if (beauty && typeof beauty.dispose === 'function') input.disposables.push({ dispose: () => beauty.dispose?.() })
    input.temporal.push({ resetHistory: () => resetTraaHistory(internals) })
    return node as unknown as ColorNode
  },
})

registerDisplayEffect({
  id: 'fxaa',
  order: 900,
  enabled: (profile) => profile.effects.fxaa || !profile.effects.traa,
  apply: (color, input) => {
    const node = fxaa(color)
    input.disposables.push(node)
    return node as unknown as ColorNode
  },
})
