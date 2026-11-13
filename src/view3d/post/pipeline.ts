import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { useSettings, type GraphicsQuality } from '../../settings'
import { getPhotoSnapshot, isPhotoMode } from '../../ui/photoSession'

// Linear HDR luminance before tone mapping. Sunlit white plaster reaches ~2–3, so a lower
// threshold makes every wall glow; lamps and fire are emissive well above this.
const BLOOM_THRESHOLD = 4

interface Bundle {
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  bokeh: BokehPass
  quality: GraphicsQuality
  ssao: boolean
  bloom: boolean
}

let bundle: Bundle | null = null
let broken = false

function wants(quality: GraphicsQuality): { ssao: boolean; bloom: boolean; kernel: number } {
  if (quality === 'low') return { ssao: false, bloom: false, kernel: 8 }
  if (quality === 'medium') return { ssao: false, bloom: true, kernel: 12 }
  if (quality === 'ultra') return { ssao: true, bloom: true, kernel: 24 }
  return { ssao: true, bloom: true, kernel: 16 }
}

function disposeBundle(): void {
  bundle?.composer.dispose()
  bundle = null
}

function build(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): Bundle | null {
  const quality = useSettings.getState().graphicsQuality
  const flags = wants(quality)
  if (!flags.ssao && !flags.bloom && !isPhotoMode()) return null
  try {
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    if (flags.ssao) {
      const ssao = new SSAOPass(scene, camera, width, height, flags.kernel)
      ssao.kernelRadius = 4
      ssao.minDistance = 0.002
      ssao.maxDistance = 0.06
      composer.addPass(ssao)
    }
    if (flags.bloom) {
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.32, BLOOM_THRESHOLD))
    }
    const bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.0008, maxblur: 0.008 })
    bokeh.enabled = false
    composer.addPass(bokeh)
    composer.addPass(new OutputPass())
    return { renderer, composer, bokeh, quality, ssao: flags.ssao, bloom: flags.bloom }
  } catch (err) {
    console.error(err)
    broken = true
    return null
  }
}

export interface RenderSize {
  width: number
  height: number
}

/** RenderPass → SSAO → bloom → bokeh (photo only) → output. Falls back to a plain render. */
export function renderFrame(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  override?: RenderSize,
): void {
  const width = override?.width ?? renderer.domElement.clientWidth
  const height = override?.height ?? renderer.domElement.clientHeight
  if (width < 2 || height < 2) {
    renderer.render(scene, camera)
    return
  }
  const quality = useSettings.getState().graphicsQuality
  const flags = wants(quality)
  const useComposer = !broken && (flags.ssao || flags.bloom || isPhotoMode())
  if (!useComposer) {
    renderer.render(scene, camera)
    return
  }
  if (!bundle || bundle.renderer !== renderer || bundle.quality !== quality || bundle.ssao !== flags.ssao || bundle.bloom !== flags.bloom) {
    disposeBundle()
    bundle = build(renderer, scene, camera, width, height)
  }
  if (!bundle) {
    renderer.render(scene, camera)
    return
  }
  try {
    const ratio = override ? 1 : renderer.getPixelRatio()
    bundle.composer.setPixelRatio(ratio)
    bundle.composer.setSize(width, height)
    const photo = getPhotoSnapshot()
    const bokehOn = photo.photo && photo.aperture > 0.01
    bundle.bokeh.enabled = bokehOn
    if (bokehOn) {
      const uniforms = bundle.bokeh.uniforms as {
        focus: { value: number }
        aperture: { value: number }
        maxblur: { value: number }
      }
      uniforms.focus.value = Math.max(0.4, photo.focus)
      uniforms.aperture.value = photo.aperture * 0.01
      uniforms.maxblur.value = 0.01
    }
    bundle.composer.render()
  } catch (err) {
    console.error(err)
    broken = true
    disposeBundle()
    renderer.render(scene, camera)
  }
}
