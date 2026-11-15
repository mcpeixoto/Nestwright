import * as THREE from 'three'
import { renderOutput } from 'three/tsl'
import type { GraphicsQuality } from '../../settings'
import { getPhotoSnapshot, isPhotoMode } from '../../ui/photoSession'
import { qualityProfile, type QualityProfile } from '../render/quality'
import { ExposureMeter } from './autoExposure'
import { dofBokehScale, dofFocalLength, dofFocus } from './effects'
import { createScenePass, type CameraMotion } from './gbuffer'
import {
  type PassNode,
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

/** A layer nothing renderable sits on; the precompile's set-up frame looks only at it. */
const PRIME_LAYER = 31

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
 * bloom on emissive, DOF in photo mode) → AgX (or ACES) tone mapping and sRGB → display effects
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
  private scenePass: PassNode | null = null
  private motion: CameraMotion | null = null
  /** Auto-exposure meter on the HDR scene colour; primary view only (the chain exists only there). */
  private meter: ExposureMeter | null = null

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly options: PostPipelineOptions,
  ) {}

  /** Build (or rebuild) the chain for `tier` if its key changed. False when no chain applies. */
  private ensure(tier: GraphicsQuality): boolean {
    if (!this.options.post || this.broken) return false
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
    const key = `${profile.tier}|${wantDof ? 1 : 0}|${postEffectRevision()}|${this.renderer.toneMapping}`
    if (key !== this.key || !this.pipeline) {
      this.disposePipeline()
      this.key = key
      this.pipeline = this.build(profile, wantDof)
    }
    return this.pipeline != null
  }

  /** The chain key the next frame would use; changes when the tier, DOF or effect list does. */
  wantedKey(tier: GraphicsQuality): string {
    const profile = qualityProfile(this.options.tier ?? tier)
    const wantDof = isPhotoMode() && getPhotoSnapshot().aperture > 0.01
    // renderOutput bakes the renderer's tone mapper into the chain, so switching it rebuilds.
    return `${profile.tier}|${wantDof ? 1 : 0}|${postEffectRevision()}|${this.renderer.toneMapping}`
  }

  /**
   * Build the chain and compile the scene pass's pipelines off the main thread
   * (createRenderPipelineAsync, node builds that yield), so the first frames after a project
   * load or tier change do not stall on shader compiles. Shadow and full-screen pipelines are
   * small and still compile on their first frame.
   */
  async precompile(tier: GraphicsQuality): Promise<void> {
    try {
      if (this.ensure(tier) && this.pipeline && this.scenePass) {
        // A pass that has never rendered is not set up yet (target type, sizes), and three's
        // compileAsync then builds pipelines for the wrong formats (invalid ones, logged as
        // "structures must have at least one member"). One frame with every layer masked off
        // sets the chain up without drawing (or compiling) a single scene object. The lights
        // join that layer for the frame, so their shadow nodes (cascades, lamp pool) get set up
        // too; shadow cameras copy the view camera's layers, so their passes stay empty.
        const mask = this.camera.layers.mask
        const lit: THREE.Light[] = []
        this.scene.traverse((obj) => {
          const light = obj as THREE.Light
          if (light.isLight && !light.layers.isEnabled(PRIME_LAYER)) {
            light.layers.enable(PRIME_LAYER)
            lit.push(light)
          }
        })
        this.camera.layers.set(PRIME_LAYER)
        try {
          this.pipeline.render()
        } finally {
          this.camera.layers.mask = mask
          for (const light of lit) light.layers.disable(PRIME_LAYER)
        }
        this.resetHistory()
        // Let that frame's targets be created and submitted before compiling against them.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await this.scenePass.compileAsync(this.renderer)
      } else {
        await this.renderer.compileAsync(this.scene, this.camera)
      }
    } catch (err) {
      console.warn('[nestwright] precompile failed', err)
    }
  }

  render(tier: GraphicsQuality): void {
    if (!this.ensure(tier) || !this.pipeline) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.camera.updateMatrixWorld()
    const now = this.camera.matrixWorld.elements
    if (isCameraCut(this.lastCamera, now)) this.resetHistory()
    this.lastCamera = Array.from(now)
    this.motion?.update(this.camera)
    try {
      this.pipeline.render()
      this.framesSinceReset += 1
      if (this.scenePass) {
        this.meter ??= new ExposureMeter()
        this.meter.run(this.renderer, this.scenePass.getTexture('output'))
      }
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
    this.motion?.reset()
    this.framesSinceReset = 0
  }

  dispose(): void {
    this.disposePipeline()
    this.meter?.dispose()
    this.meter = null
  }

  private build(profile: QualityProfile, photo: boolean): THREE.RenderPipeline | null {
    try {
      const { scenePass, gbuffer, motion } = createScenePass(this.scene, this.camera, neededChannels(profile, photo))
      this.disposables = [scenePass]
      if (motion) this.disposables.push(motion)
      this.scenePass = scenePass
      this.motion = motion
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
      // Tone mapping (the renderer's AgX or ACES) and the sRGB encode happen here, so display effects
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
    this.scenePass = null
    this.motion = null
    this.lastCamera = null
  }
}
