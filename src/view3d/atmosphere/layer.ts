import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { getEntry } from '../../catalog/registry'
import type { Environment, Project } from '../../model/types'
import { sunDirection, sunLook } from '../../model/sunLook'
import { shadowMapSize, useSettings } from '../../settings'
import type { SceneLayer, SceneLayerContext, SceneViewState } from '../layers'
import { photoExposure } from '../../ui/photoSession'
import { clockTime } from './clock'
import { createClouds } from './clouds'
import { createPrecip, driftPrecip } from './precip'
import { createStars } from './stars'
import { attachWeather, setWeatherMix } from './weather'

const ENV_INTENSITY = 0.38
const SUN_SCALE = 450000

const fallbackEnv: Environment = {
  dayOfYear: 172,
  time: 15.5,
  latitude: 41,
  north: 0,
  weather: 'clear',
  cloudiness: 0.12,
  autoLights: true,
}

function paintSky(sky: Sky, unit: THREE.Vector3, env: Environment, showSun: boolean): void {
  const mat = sky.material as THREE.ShaderMaterial
  mat.fog = false
  const uniforms = mat.uniforms
  const clear = env.weather === 'clear'
  const set = (key: string, value: number) => {
    const slot = uniforms[key]
    if (slot) slot.value = value
  }
  const cover = env.weather === 'fog' ? 0.9 : env.weather === 'clear' ? env.cloudiness : 0.45 + env.cloudiness * 0.45
  set('turbidity', clear ? 2 + env.cloudiness * 3 : env.weather === 'fog' ? 10 : 6 + env.cloudiness * 4)
  set('rayleigh', clear ? 1.6 - env.cloudiness * 0.4 : env.weather === 'fog' ? 0.35 : 0.8)
  set('mieCoefficient', clear ? 0.003 : 0.008)
  set('mieDirectionalG', 0.8)
  set('cloudCoverage', cover)
  set('cloudDensity', clear ? 0.3 : 0.55)
  set('cloudScale', 0.00016)
  set('showSunDisc', showSun ? 1 : 0)
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

function lampsShouldGlow(project: Project, night: boolean): boolean {
  for (const level of project.levels) {
    for (const item of level.items) {
      if (!getEntry(item.catalogId)?.light) continue
      if (item.lightOn !== false) return true
      if (night && project.environment.autoLights) return true
    }
  }
  return false
}

export function createAtmosphereLayer(ctx: SceneLayerContext): SceneLayer {
  const scene = ctx.scene
  scene.environmentIntensity = ENV_INTENSITY
  if (ctx.camera.far > 1400) {
    ctx.camera.far = 1200
    ctx.camera.updateProjectionMatrix()
  }
  if (ctx.renderer) {
    ctx.renderer.outputColorSpace = THREE.SRGBColorSpace
    ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping
    ctx.renderer.toneMappingExposure = 0.62
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap
  }

  const sky = new Sky()
  sky.scale.setScalar(480)
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

  const moon = new THREE.DirectionalLight('#c5d4ff', 0)
  moon.name = 'moon'
  scene.add(moon)
  scene.add(moon.target)

  const hemi = new THREE.HemisphereLight('#d7e7f6', '#6d7a58', 0.7)
  scene.add(hemi)

  const clouds = createClouds()
  scene.add(clouds.mesh)
  const stars = createStars()
  scene.add(stars.points)
  const precip = createPrecip()
  scene.add(precip.group)

  const autoLights = new THREE.Group()
  autoLights.name = 'auto-lights'
  scene.add(autoLights)

  const pmrem = ctx.renderer ? new THREE.PMREMGenerator(ctx.renderer) : null
  let envTarget: THREE.WebGLRenderTarget | null = null
  let envKey = ''
  let envReady = false
  let project: Project | null = null
  let view: SceneViewState | null = null
  let quality = useSettings.getState().graphicsQuality
  const unit = new THREE.Vector3(0.35, 0.78, 0.25).normalize()
  let glowKey = ''
  let autoKey = ''

  paintSky(sky, unit, fallbackEnv, true)
  paintSky(envSky, unit, fallbackEnv, false)

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

  const paintWindows = (glow: boolean) => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of list) {
        const mat = material as THREE.MeshStandardMaterial
        if (!mat?.isMeshStandardMaterial || !mat.userData.windowGlass) continue
        if (glow) {
          mat.emissive.set('#ffb15a')
          mat.emissiveIntensity = 1.15
        } else {
          mat.emissive.set('#000000')
          mat.emissiveIntensity = 0
        }
      }
    })
  }

  const syncAutoLights = (source: Project, night: boolean) => {
    for (const child of [...autoLights.children]) {
      autoLights.remove(child)
    }
    if (!source.environment.autoLights || !night) return
    for (const level of source.levels) {
      for (const item of level.items) {
        if (item.lightOn !== false) continue
        const entry = getEntry(item.catalogId)
        if (!entry?.light) continue
        const light = new THREE.PointLight(entry.light.color, entry.light.intensity, entry.light.distance, 2)
        const scaleY = entry.defaultSize.h > 1e-4 ? item.size.h / entry.defaultSize.h : 1
        light.position.set(
          item.position.x,
          level.elevation + item.elevation + entry.light.offsetY * scaleY,
          item.position.y,
        )
        autoLights.add(light)
      }
    }
  }

  const dressOutdoor = () => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const outdoor = mesh.name === 'ground' || mesh.userData.roof === true || mesh.userData.outdoor === true
      if (!outdoor) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of list) if (material) attachWeather(material)
    })
  }

  const apply = () => {
    if (!project || !view) return
    const env = project.environment ?? fallbackEnv
    const time = clockTime(env.time ?? 12)
    const vec = sunDirection(env.dayOfYear ?? 172, time, env.latitude ?? 41, env.north ?? 0)
    unit.set(vec.x, vec.y, vec.z)
    if (unit.lengthSq() < 1e-8) unit.set(0.2, 0.4, 0.2)
    unit.normalize()
    const look = sunLook(Math.asin(THREE.MathUtils.clamp(unit.y, -1, 1)))
    sun.color.setRGB(look.r, look.g, look.b)
    sun.intensity = look.intensity
    moon.color.set('#c6d4ff')
    moon.intensity = look.moon
    hemi.color.set(look.daylight > 0.35 ? '#d7e7f6' : '#243044')
    hemi.groundColor.set(look.daylight > 0.35 ? '#7d8a5c' : '#1c2218')
    hemi.intensity = 0.28 + look.daylight * 0.55
    if (ctx.renderer) {
      const exposure = look.exposure * photoExposure()
      ctx.renderer.toneMappingExposure = Number.isFinite(exposure) ? exposure : 0.5
      const clear = look.daylight > 0.4 ? '#9ec4e4' : '#141820'
      ctx.renderer.setClearColor(clear)
    }
    paintSky(sky, unit, env, look.intensity > 0.05)
    paintSky(envSky, unit, env, false)

    const night = look.daylight < 0.28
    stars.setNight(night ? 1 - env.cloudiness * 0.65 : 0)
    const cloudiness = THREE.MathUtils.clamp(env.cloudiness ?? 0, 0, 1)
    const weather = env.weather ?? 'clear'
    const density =
      weather === 'clear' ? 0.15 + cloudiness * 0.45 : weather === 'fog' ? 0.15 : 0.45 + cloudiness * 0.5
    const cover = weather === 'clear' ? 0.62 - cloudiness * 0.2 : 0.42 - cloudiness * 0.12
    clouds.set(density, cover, night ? '#8d97a3' : '#f3f5f7')
    const nextQuality = useSettings.getState().graphicsQuality
    precip.set(weather, weather === 'clear' ? cloudiness : 0.7, nextQuality)
    setWeatherMix(weather === 'rain' ? 0.82 : weather === 'fog' ? 0.2 : 0, weather === 'snow' ? 0.4 + cloudiness * 0.6 : 0)

    const mapSize = shadowMapSize(nextQuality)
    if (quality !== nextQuality || sun.shadow.mapSize.x !== mapSize) {
      quality = nextQuality
      sun.shadow.mapSize.set(mapSize, mapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }

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
    moon.target.position.copy(center)
    moon.position.copy(center).addScaledVector(unit, -(span + 14))

    const reach = Math.max(project.terrain?.width ?? 20, project.terrain?.depth ?? 20, 20)
    const fogColor = night ? '#1a2230' : weather === 'fog' ? '#c5ced6' : weather === 'snow' ? '#e4eaf0' : '#c5d5e4'
    const fogDensity =
      weather === 'fog' ? 0.028 : weather === 'rain' ? 0.01 : weather === 'snow' ? 0.012 : weather === 'cloudy' ? 0.0045 : 0.0022
    const scaled = fogDensity * (30 / Math.max(reach, 16))
    scene.fog = new THREE.FogExp2(fogColor, Math.max(0.0015, scaled))

    const glow = night && lampsShouldGlow(project, night)
    const nextGlow = glow ? 'on' : 'off'
    if (nextGlow !== glowKey) {
      glowKey = nextGlow
      paintWindows(glow)
    }
    const autoSig = `${night ? 1 : 0}|${env.autoLights ? 1 : 0}|${project.updatedAt}`
    if (autoSig !== autoKey) {
      autoKey = autoSig
      syncAutoLights(project, night)
    }
    dressOutdoor()

    const bucket = Math.round(time)
    const key = `${env.dayOfYear}|${bucket}|${env.latitude}|${env.north}|${weather}|${cloudiness}`
    if (key !== envKey || !envReady) {
      envKey = key
      envReady = refreshEnv()
    }
  }

  return {
    sync(next, state) {
      project = next
      view = state
      try {
        apply()
      } catch (err) {
        console.error(err)
      }
    },
    update(_dt, elapsed) {
      try {
        sky.position.copy(ctx.camera.position)
        clouds.mesh.position.copy(ctx.camera.position)
        stars.points.position.copy(ctx.camera.position)
        clouds.drift(elapsed)
        driftPrecip(precip.group, elapsed)
        if (!project || !view) return
        if (!envReady) envReady = refreshEnv()
        apply()
      } catch (err) {
        console.error(err)
      }
    },
    dispose() {
      scene.remove(sky)
      scene.remove(sun)
      scene.remove(sun.target)
      scene.remove(moon)
      scene.remove(moon.target)
      scene.remove(hemi)
      scene.remove(clouds.mesh)
      scene.remove(stars.points)
      scene.remove(precip.group)
      scene.remove(autoLights)
      scene.environment = null
      scene.fog = null
      envTarget?.dispose()
      pmrem?.dispose()
      sky.geometry.dispose()
      envSky.geometry.dispose()
      ;(sky.material as THREE.Material).dispose()
      ;(envSky.material as THREE.Material).dispose()
      clouds.dispose()
      stars.dispose()
      precip.dispose()
    },
  }
}
