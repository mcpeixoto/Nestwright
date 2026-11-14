import * as THREE from 'three'
import { renderOutput } from 'three/tsl'
import type { GraphicsQuality } from '../../settings'
import { getPhotoSnapshot, isPhotoMode } from '../../ui/photoSession'
import { qualityProfile, type QualityProfile } from '../render/quality'
import { dofBokehScale, dofFocalLength, dofFocus } from './effects'
import { createScenePass } from './gbuffer'
import {
  neededChannels,
  postDisplayEffects,
  postEffectRevision,
  postEffects,
  type ColorNode,
  type PostEffectInput,
} from './registry'
import { isCameraCut, SETTLE_FRAMES } from './temporal'

export {
  activeEffectIds,
  registerDisplayEffect,
  registerPostEffect,
  type GBuffer,
  type GBufferChannel,
  type PostDisplayEffect,
  type PostEffect,
  type PostEffectInput,
} from './registry'

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
 * One MRT scene pass (colour, plus view normal, velocity, metal/rough and albedo when an
 * active effect reads them) → HDR effects (GTAO on Medium/High, SSR on High+, SSGI on Ultra,
 * bloom on emissive, DOF in photo mode) → ACES tone mapping and sRGB → display effects
 * (TRAA on Medium+, FXAA on Low). One per SceneController, built lazily and rebuilt (old GPU
 * resources freed) when the tier or photo mode changes. Falls back to a plain render if a
 * build or frame throws.
 */
export class PostPipeline {
  private pipeline: THREE.RenderPipeline | null = null
  private disposables: { dispose(): void }[] = []
  private temporal: { resetHistory(): void }[] = []
  private key = ''
  private broken = false
  private lastCamera: number[] | null = null
  private framesSinceReset = 0

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
      dofFocus.value = Math.max(0.4, snap.focus)
      // Aperture 0..1 from the photo panel: wider opens a shallower focus band.
      dofFocalLength.value = THREE.MathUtils.lerp(12, 0.6, THREE.MathUtils.clamp(snap.aperture, 0, 1))
      dofBokehScale.value = snap.aperture > 0.01 ? 1 + snap.aperture * 4 : 0
    }
    const wantDof = photo && getPhotoSnapshot().aperture > 0.01
    const key = `${profile.tier}|${wantDof ? 1 : 0}|${postEffectRevision()}`
    if (key !== this.key || !this.pipeline) {
      this.disposePipeline()
      this.key = key
      this.pipeline = this.build(profile, wantDof)
    }
    if (!this.pipeline) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.camera.updateMatrixWorld()
    const now = this.camera.matrixWorld.elements
    if (isCameraCut(this.lastCamera, now)) this.resetHistory()
    this.lastCamera = Array.from(now)
    try {
      this.pipeline.render()
      this.framesSinceReset += 1
    } catch (err) {
      console.error(err)
      this.broken = true
      this.disposePipeline()
      this.renderer.render(this.scene, this.camera)
    }
  }

  /**
   * A frame for a still (export, pixel sample): when temporal history was just reset, render
   * until it has converged so the still is anti-aliased and noise-free like the live view.
   */
  renderStill(tier: GraphicsQuality): void {
    this.render(tier)
    if (!this.pipeline || this.temporal.length === 0) return
    for (let i = this.framesSinceReset; i < SETTLE_FRAMES; i++) this.render(tier)
  }

  /** Forget temporal history (TRAA): the next frame starts from itself. */
  resetHistory(): void {
    for (const node of this.temporal) node.resetHistory()
    this.framesSinceReset = 0
  }

  dispose(): void {
    this.disposePipeline()
  }

  private build(profile: QualityProfile, photo: boolean): THREE.RenderPipeline | null {
    try {
      const { scenePass, gbuffer } = createScenePass(this.scene, this.camera, neededChannels(profile, photo))
      this.disposables = [scenePass]
      this.temporal = []
      const input: PostEffectInput = {
        scenePass,
        scene: this.scene,
        camera: this.camera,
        profile,
        gbuffer,
        disposables: this.disposables,
        temporal: this.temporal,
      }
      let color = gbuffer.color
      for (const effect of postEffects()) {
        if (effect.enabled(profile, photo)) color = effect.apply(color, input)
      }
      // Tone mapping (the renderer's ACES) and the sRGB encode happen here, so display effects
      // see final colours.
      let display = renderOutput(color) as unknown as ColorNode
      for (const effect of postDisplayEffects()) {
        if (effect.enabled(profile, photo)) display = effect.apply(display, input)
      }
      const pipeline = new THREE.RenderPipeline(this.renderer)
      pipeline.outputColorTransform = false
      pipeline.outputNode = display
      this.framesSinceReset = 0
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
    this.temporal = []
    this.lastCamera = null
  }
}
