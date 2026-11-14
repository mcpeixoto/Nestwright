import * as THREE from 'three'
import { pass, renderOutput, uniform } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import type { GraphicsQuality } from '../../settings'
import { getPhotoSnapshot, isPhotoMode } from '../../ui/photoSession'
import { qualityProfile, type QualityProfile } from '../render/quality'

type ColorNode = THREE.Node<'vec4'>
type PassNode = ReturnType<typeof pass>

// Linear HDR luminance before tone mapping. Sunlit white plaster reaches ~2–3, so a lower
// threshold makes every wall glow; lamps and fire are emissive well above this.
const BLOOM_THRESHOLD = 4

/** What an effect gets to read when the chain is built. */
export interface PostEffectInput {
  scenePass: PassNode
  scene: THREE.Scene
  camera: THREE.Camera
  profile: QualityProfile
  /** Nodes that own render targets; disposed with the chain. */
  disposables: { dispose(): void }[]
}

/**
 * One stage of the HDR (pre tone mapping) chain. Effects run in ascending `order`:
 * AO ~100, SSR ~200, SSGI ~300, bloom 500, DOF 600. Register more with `registerPostEffect`.
 */
export interface PostEffect {
  id: string
  order: number
  enabled(profile: QualityProfile, photo: boolean): boolean
  apply(color: ColorNode, input: PostEffectInput): ColorNode
}

/** Runs after tone mapping, on display-referred colour (FXAA, later TRAA resolve). */
export interface PostDisplayEffect {
  id: string
  order: number
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

// PHASE1-PORT: SSAO (the WebGL chain's SSAOPass on High/Ultra) is off until the GTAO effect
// lands here at order ~100; it needs a normal MRT output on the scene pass.
const focus = uniform(8)
const focalLength = uniform(4)
const bokehScale = uniform(1)

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
    const node = dof(color, input.scenePass.getViewZNode(), focus, focalLength, bokehScale)
    input.disposables.push(node)
    return node as unknown as ColorNode
  },
})

// PHASE1-PORT: FXAA on every tier stands in for TRAA (the renderer runs without MSAA now).
// The TRAA agent should register a 'traa' display effect and limit this one to profile.effects.fxaa.
registerDisplayEffect({
  id: 'fxaa',
  order: 900,
  enabled: () => true,
  apply: (color, input) => {
    const node = fxaa(color)
    input.disposables.push(node)
    return node as unknown as ColorNode
  },
})

export interface RenderSize {
  width: number
  height: number
}

export interface PostPipelineOptions {
  /** false: plain `renderer.render` (the compare pane). */
  post: boolean
  /** Forces a tier instead of the setting (the compare pane runs on Low). */
  tier?: GraphicsQuality
}

/**
 * Scene pass → HDR effects (bloom on emissive, DOF in photo mode) → tone mapping and sRGB →
 * display effects (FXAA). One per SceneController, built lazily and rebuilt when the tier or
 * photo mode changes. Falls back to a plain render if a build or frame throws.
 */
export class PostPipeline {
  private pipeline: THREE.RenderPipeline | null = null
  private disposables: { dispose(): void }[] = []
  private key = ''
  private broken = false

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly options: PostPipelineOptions,
  ) {}

  render(tier: GraphicsQuality): void {
    if (!this.options.post || this.broken) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    const profile = qualityProfile(this.options.tier ?? tier)
    const photo = isPhotoMode()
    if (photo) {
      const snap = getPhotoSnapshot()
      focus.value = Math.max(0.4, snap.focus)
      // Aperture 0..1 from the photo panel: wider opens a shallower focus band.
      focalLength.value = THREE.MathUtils.lerp(12, 0.6, THREE.MathUtils.clamp(snap.aperture, 0, 1))
      bokehScale.value = snap.aperture > 0.01 ? 1 + snap.aperture * 4 : 0
    }
    const wantDof = photo && getPhotoSnapshot().aperture > 0.01
    const key = `${profile.tier}|${wantDof ? 1 : 0}|${effectRevision}`
    if (key !== this.key || !this.pipeline) {
      this.disposePipeline()
      this.key = key
      this.pipeline = this.build(profile, wantDof)
    }
    if (!this.pipeline) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    try {
      this.pipeline.render()
    } catch (err) {
      console.error(err)
      this.broken = true
      this.disposePipeline()
      this.renderer.render(this.scene, this.camera)
    }
  }

  dispose(): void {
    this.disposePipeline()
  }

  private build(profile: QualityProfile, photo: boolean): THREE.RenderPipeline | null {
    try {
      const scenePass = pass(this.scene, this.camera)
      this.disposables = [scenePass]
      const input: PostEffectInput = { scenePass, scene: this.scene, camera: this.camera, profile, disposables: this.disposables }
      let color = scenePass.getTextureNode('output') as unknown as ColorNode
      for (const effect of hdrEffects) {
        if (effect.enabled(profile, photo)) color = effect.apply(color, input)
      }
      // Tone mapping and the sRGB encode happen here, so display effects see final colours.
      let display = renderOutput(color) as unknown as ColorNode
      for (const effect of displayEffects) {
        if (effect.enabled(profile, photo)) display = effect.apply(display, input)
      }
      const pipeline = new THREE.RenderPipeline(this.renderer)
      pipeline.outputColorTransform = false
      pipeline.outputNode = display
      return pipeline
    } catch (err) {
      console.error(err)
      this.broken = true
      return null
    }
  }

  private disposePipeline(): void {
    this.pipeline?.dispose()
    this.pipeline = null
    for (const node of this.disposables) node.dispose()
    this.disposables = []
  }
}
