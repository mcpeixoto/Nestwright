import type * as THREE from 'three'
import type { pass } from 'three/tsl'
import type { QualityProfile } from '../render/quality'

export type ColorNode = THREE.Node<'vec4'>
export type FloatNode = THREE.Node<'float'>
export type PassNode = ReturnType<typeof pass>

/** Scene-pass attachments an effect can ask for. `output` (HDR colour) and depth always exist. */
export type GBufferChannel = 'normal' | 'velocity' | 'metalRough' | 'albedo'

/**
 * Read-only views of the one MRT scene pass. Only the channels some enabled effect listed in
 * `needs` are attached; the others are null.
 */
export interface GBuffer {
  /** HDR scene colour, before any effect. */
  color: ColorNode
  /** Non-linear depth texture. */
  depth: THREE.Node
  /** View-space normal, decoded (a sample node, so effects can `.sample(uv)` it). */
  normal: THREE.Node | null
  /** NDC motion since the last frame (xy). */
  velocity: THREE.Node | null
  /** r = metalness, g = roughness (rough = 1 for unlit materials). */
  metalRough: THREE.Node | null
  /** Linear diffuse albedo luminance (float; 8-bit). */
  albedo: THREE.Node | null
}

/** What an effect gets to read when the chain is built. */
export interface PostEffectInput {
  scenePass: PassNode
  scene: THREE.Scene
  camera: THREE.Camera
  profile: QualityProfile
  gbuffer: GBuffer
  /** Nodes that own render targets; disposed with the chain. */
  disposables: { dispose(): void }[]
  /** Nodes with history that must be reset on a camera cut. */
  temporal: { resetHistory(): void }[]
}

/**
 * One stage of the HDR (pre tone mapping) chain. Effects run in ascending `order`:
 * AO ~100, SSR ~200, SSGI ~300, bloom 500, DOF 600. Register more with `registerPostEffect`.
 */
export interface PostEffect {
  id: string
  order: number
  /** Scene-pass channels this effect reads. */
  needs?: readonly GBufferChannel[]
  enabled(profile: QualityProfile, photo: boolean): boolean
  apply(color: ColorNode, input: PostEffectInput): ColorNode
}

/** Runs after tone mapping, on display-referred colour (TRAA resolve, FXAA). */
export interface PostDisplayEffect {
  id: string
  order: number
  needs?: readonly GBufferChannel[]
  enabled(profile: QualityProfile, photo: boolean): boolean
  apply(color: ColorNode, input: PostEffectInput): ColorNode
}

const hdrEffects: PostEffect[] = []
const displayEffects: PostDisplayEffect[] = []
let effectRevision = 0

export function registerPostEffect(effect: PostEffect): void {
  const at = hdrEffects.findIndex((item) => item.id === effect.id)
  if (at >= 0) hdrEffects.splice(at, 1, effect)
  else hdrEffects.push(effect)
  hdrEffects.sort((a, b) => a.order - b.order)
  effectRevision += 1
}

export function registerDisplayEffect(effect: PostDisplayEffect): void {
  const at = displayEffects.findIndex((item) => item.id === effect.id)
  if (at >= 0) displayEffects.splice(at, 1, effect)
  else displayEffects.push(effect)
  displayEffects.sort((a, b) => a.order - b.order)
  effectRevision += 1
}

export function postEffects(): readonly PostEffect[] {
  return hdrEffects
}

export function postDisplayEffects(): readonly PostDisplayEffect[] {
  return displayEffects
}

export function postEffectRevision(): number {
  return effectRevision
}

/** The ids of the effects a tier runs, HDR stages first, in order. */
export function activeEffectIds(profile: QualityProfile, photo: boolean): string[] {
  return [...hdrEffects, ...displayEffects].filter((effect) => effect.enabled(profile, photo)).map((effect) => effect.id)
}

/** The scene-pass channels the active effects need, so unused attachments are never allocated. */
export function neededChannels(profile: QualityProfile, photo: boolean): Set<GBufferChannel> {
  const out = new Set<GBufferChannel>()
  for (const effect of [...hdrEffects, ...displayEffects]) {
    if (!effect.enabled(profile, photo)) continue
    for (const channel of effect.needs ?? []) out.add(channel)
  }
  return out
}
