import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import type { Environment, Project } from '../../model/types'
import { sunVector } from '../../model/sun'
import { shadowMapSize, useSettings, type GraphicsQuality } from '../../settings'
import { registerSceneLayer, type SceneLayer, type SceneLayerContext, type SceneViewState } from '../layers'

/** ACES with the Preetham sky. 1.0 clips the sky to white. */
const EXPOSURE = 0.62
/** PMREM of the sky is already bright. Keep it as soft fill, not a second sun. */
const ENV_INTENSITY = 0.38
/** Sky.sunPosition is divided by 450000 inside the shader. A unit vector kills the blue. */
const SUN_SCALE = 450000

function paintSky(sky: Sky, unit: THREE.Vector3, env: Environment, showSun: boolean, elapsed: number): void {
  const mat = sky.material as THREE.ShaderMaterial
  mat.fog = false
  const uniforms = mat.uniforms
  const clear = env.weather === 'clear'
  const cover =
    env.weather === 'fog'
      ? 0.82
      : env.weather === 'clear'
        ? env.cloudiness * 0.35
        : 0.5 + env.cloudiness * 0.4
  const set = (key: string, value: number) => {
    const slot = uniforms[key]
    if (slot) slot.value = value
  }
  set('turbidity', clear ? 2 + env.cloudiness * 2.5 : 7 + env.cloudiness * 3)
  set('rayleigh', clear ? 1.5 : 0.7)
  set('mieCoefficient', clear ? 0.0032 : 0.007)
  set('mieDirectionalG', 0.8)
  set('cloudCoverage', cover)
  set('cloudDensity', clear ? 0.32 : 0.55)
  set('cloudScale', 0.00016)
  set('showSunDisc', showSun ? 1 : 0)
  set('time', elapsed)
  const sun = uniforms.sunPosition?.value
  if (sun instanceof THREE.Vector3) sun.copy(unit).multiplyScalar(SUN_SCALE)
}

function boundsOf(project: Project, state: SceneViewState): THREE.Box3 {
  const box = new THREE.Box3()
  let any = false
  const active = project.levels.find((level) => level.id === state.activeLevelId)
  const elev = active?.elevation ?? 0
  for (const level of project.levels) {
    const above = level.elevation > elev + 1e-3
    if (state.levelDisplay !== 'all' && above) continue
    if (state.levelDisplay === 'current' && level.id !== state.activeLevelId) continue
    for (const wall of level.walls) {
      any = true
      box.expandByPoint(new THREE.Vector3(wall.a.x, level.elevation, wall.a.y))
      box.expandByPoint(new THREE.Vector3(wall.b.x, level.elevation + wall.height, wall.b.y))
    }
  }
  if (!any) box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 3, 4))
  return box
}

export function createAtmosphereLayer(ctx: SceneLayerContext): SceneLayer {
  const scene = ctx.scene
  scene.environmentIntensity = ENV_INTENSITY
  if (ctx.renderer) {
    ctx.renderer.outputColorSpace = THREE.SRGBColorSpace
    ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping
    ctx.renderer.toneMappingExposure = EXPOSURE
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap
  }

  const sky = new Sky()
  sky.scale.setScalar(1800)
  sky.frustumCulled = false
  sky.name = 'sky'
  scene.add(sky)

  const envSky = new Sky()
  envSky.scale.setScalar(80)
  const envScene = new THREE.Scene()
  envScene.add(envSky)

  const sun = new THREE.DirectionalLight('#fff4e0', 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.radius = 3
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.035
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 80
  scene.add(sun)
  scene.add(sun.target)

  const hemi = new THREE.HemisphereLight('#d7e7f6', '#7d8a5c', 0.75)
  scene.add(hemi)

  const pmrem = ctx.renderer ? new THREE.PMREMGenerator(ctx.renderer) : null
  let envTarget: THREE.WebGLRenderTarget | null = null
  let envKey = ''
  let envReady = false
  let project: Project | null = null
  let view: SceneViewState | null = null
  let quality: GraphicsQuality | null = null
  let elapsedTime = 0
  const unit = new THREE.Vector3(0.35, 0.78, 0.25).normalize()

  const fallbackEnv: Environment = {
    dayOfYear: 172,
    time: 15.5,
    latitude: 41,
    north: 0,
    weather: 'clear',
    cloudiness: 0.12,
    autoLights: true,
  }
  paintSky(sky, unit, fallbackEnv, true, 0)
  paintSky(envSky, unit, fallbackEnv, false, 0)

  const refreshEnv = (): boolean => {
    if (!pmrem || !ctx.renderer || ctx.renderer.domElement.clientWidth < 2) return false
    try {
      const next = pmrem.fromScene(envScene, 0.04, 0.1, 200)
      scene.environment = next.texture
      scene.environmentIntensity = ENV_INTENSITY
      envTarget?.dispose()
      envTarget = next
      return true
    } catch {
      return false
    }
  }

  const apply = () => {
    if (!project || !view) return
    const env = project.environment
    const vec = sunVector(env.dayOfYear, env.time, env.latitude)
    unit.set(vec.x, vec.y, vec.z)
    if (unit.lengthSq() < 1e-8) unit.set(0.2, 0.4, 0.2)
    unit.normalize()
    const daylight = Math.min(1, Math.max(0, unit.y) / 0.28)
    sun.intensity = 0.2 + daylight * 2.8
    hemi.intensity = 0.65 + daylight * 0.2
    paintSky(sky, unit, env, true, elapsedTime)
    paintSky(envSky, unit, env, false, 0)

    const nextQuality = useSettings.getState().graphicsQuality
    const mapSize = shadowMapSize(nextQuality)
    if (quality !== nextQuality || sun.shadow.mapSize.x !== mapSize) {
      quality = nextQuality
      sun.shadow.mapSize.set(mapSize, mapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    if (ctx.renderer) ctx.renderer.toneMappingExposure = EXPOSURE

    const box = boundsOf(project, view)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z, 8) * 0.7
    const cam = sun.shadow.camera as THREE.OrthographicCamera
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.far = span * 4 + 20
    cam.updateProjectionMatrix()
    sun.target.position.copy(center)
    sun.position.copy(center).addScaledVector(unit, span + 12)

    const reach = Math.max(project.terrain.width, project.terrain.depth, 20)
    const foggy = env.weather === 'fog'
    const near = foggy ? Math.max(22, reach * 0.55) : reach * 2.4
    const far = foggy ? near + reach * 1.6 : near + reach * 3.5
    scene.fog = new THREE.Fog('#d5e3ee', near, far)

    const key = `${env.dayOfYear}|${env.time}|${env.latitude}|${env.weather}|${env.cloudiness}`
    if (key !== envKey || !envReady) {
      envKey = key
      envReady = refreshEnv()
    }
  }

  return {
    sync(next, state) {
      project = next
      view = state
      apply()
    },
    update(_dt, elapsed) {
      elapsedTime = elapsed
      sky.position.copy(ctx.camera.position)
      const slot = (sky.material as THREE.ShaderMaterial).uniforms.time
      if (slot) slot.value = elapsed
      if (!project || !view) return
      if (!envReady) envReady = refreshEnv()
      if (quality !== useSettings.getState().graphicsQuality) apply()
    },
    dispose() {
      scene.remove(sky)
      scene.remove(sun)
      scene.remove(sun.target)
      scene.remove(hemi)
      scene.environment = null
      scene.fog = null
      envTarget?.dispose()
      pmrem?.dispose()
      sky.geometry.dispose()
      envSky.geometry.dispose()
      const skyMat = sky.material as THREE.Material
      skyMat.dispose()
      ;(envSky.material as THREE.Material).dispose()
    },
  }
}

registerSceneLayer({
  id: 'atmosphere',
  create: createAtmosphereLayer,
})
