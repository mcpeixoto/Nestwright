import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { getEntry } from '../../catalog/registry'
import type { Environment, Project } from '../../model/types'
import { sunDirection, sunLook, TWILIGHT_RAD } from '../../model/sunLook'
import { exteriorWindowSpills } from '../../model/windowSpill'
import { shadowMapSize, useSettings } from '../../settings'
import type { SceneLayer, SceneLayerContext, SceneViewState } from '../layers'
import { photoExposure } from '../../ui/photoSession'
import { clockTime } from './clock'
import { createClouds } from './clouds'
import { gradeSkyMaterial, type SkyGrade } from './gradeSky'
import { createPrecip, driftPrecip } from './precip'
import { createSkyParams, writeSkyParams, type SkyParams } from './skyParams'
import { createStars } from './stars'
import { attachWeather, setWeatherMix } from './weather'

/** PMREM fill. High values let a cyan sky tint red roofs lilac. */
const ENV_INTENSITY = 0.7
/** Added before tone mapping so the disc clips to a warm white, not a green blob. */
const SUN_DISC: readonly [number, number, number] = [14, 8.2, 2.4]

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

function paintSky(sky: Sky, unit: THREE.Vector3, showSun: boolean, grade: SkyGrade, light: boolean, params: SkyParams): void {
  const mat = sky.material as THREE.ShaderMaterial
  mat.fog = false
  const uniforms = mat.uniforms
  const set = (key: string, value: number) => {
    const slot = uniforms[key]
    if (slot) slot.value = value
  }
  set('turbidity', params.turbidity)
  set('rayleigh', params.rayleigh)
  set('mieCoefficient', params.mieCoefficient)
  set('mieDirectionalG', params.mieDirectionalG)
  set('cloudCoverage', 0)
  set('cloudDensity', 0)
  set('showSunDisc', showSun ? 1 : 0)
  const sun = uniforms.sunPosition?.value
  if (sun instanceof THREE.Vector3) sun.copy(unit).multiplyScalar(SUN_SCALE)
  const zenith = light ? params.zenithLight : params.zenithScene
  const horizon = light ? params.horizonLight : params.horizonScene
  grade.zenith.setRGB(zenith[0], zenith[1], zenith[2])
  grade.horizon.setRGB(horizon[0], horizon[1], horizon[2])
  if (showSun) grade.sunDisc.setRGB(SUN_DISC[0], SUN_DISC[1], SUN_DISC[2])
  else grade.sunDisc.setRGB(0, 0, 0)
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
  if (ctx.camera.far < 1600) {
    ctx.camera.far = 1600
    ctx.camera.updateProjectionMatrix()
  }
  if (ctx.renderer) {
    ctx.renderer.outputColorSpace = THREE.SRGBColorSpace
    ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping
    ctx.renderer.toneMappingExposure = 0.5
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

  const sun = new THREE.DirectionalLight('#fff4e0', 2.5)
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

  const hemi = new THREE.HemisphereLight('#b7cbe4', '#4a5538', 0.5)
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
  let autoKey = ''
  let envTimer = 0
  let pendingKey = ''
  const background = new THREE.Color()
  const skyGrade: SkyGrade = { zenith: new THREE.Color(), horizon: new THREE.Color(), sunDisc: new THREE.Color() }
  const envGrade: SkyGrade = { zenith: new THREE.Color(), horizon: new THREE.Color(), sunDisc: new THREE.Color() }
  gradeSkyMaterial(sky, skyGrade)
  gradeSkyMaterial(envSky, envGrade)
  const skyState = createSkyParams()
  let skyKey = ''
  const fog = new THREE.Fog(0x000000, skyState.fogNear, skyState.fogFar)
  scene.fog = fog
  scene.background = background
  const skyMat = sky.material as THREE.ShaderMaterial
  skyMat.depthWrite = false
  sky.renderOrder = -2

  const applySky = (alt: number, weather: string, cloudiness: number, exposure: number) => {
    const nextKey = `${alt.toFixed(3)}|${weather}|${cloudiness.toFixed(2)}|${exposure.toFixed(3)}`
    if (nextKey === skyKey) return
    skyKey = nextKey
    writeSkyParams(alt, weather, cloudiness, exposure, skyState)
    paintSky(sky, unit, skyState.sunDisc > 0, skyGrade, false, skyState)
    paintSky(envSky, unit, false, envGrade, true, skyState)
    fog.near = skyState.fogNear
    fog.far = skyState.fogFar
    fog.color.setRGB(skyState.horizonScene[0], skyState.horizonScene[1], skyState.horizonScene[2])
    background.copy(fog.color)
    hemi.color.set(skyState.hemiSky)
    hemi.groundColor.set(skyState.hemiGround)
    hemi.intensity = skyState.hemiIntensity
  }
  applySky(0.7, 'clear', 0.12, 0.5)

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
          mat.emissiveIntensity = 2.4
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
        if (item.lightOn === false) continue
        const entry = getEntry(item.catalogId)
        if (!entry?.light) continue
        const light = new THREE.PointLight(entry.light.color, entry.light.intensity * 22, Math.max(6, entry.light.distance), 2)
        const scaleY = entry.defaultSize.h > 1e-4 ? item.size.h / entry.defaultSize.h : 1
        light.position.set(
          item.position.x,
          level.elevation + item.elevation + entry.light.offsetY * scaleY,
          item.position.y,
        )
        autoLights.add(light)
      }
    }
    for (const level of source.levels) {
      for (const spill of exteriorWindowSpills(level)) {
        const lamp = new THREE.PointLight('#ffb15a', 14, 8.5, 2)
        lamp.position.set(spill.x, spill.y, spill.z)
        lamp.castShadow = false
        autoLights.add(lamp)
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
    const alt = Math.asin(THREE.MathUtils.clamp(unit.y, -1, 1))
    const look = sunLook(alt)
    sun.color.setRGB(look.r, look.g, look.b)
    sun.intensity = look.intensity
    moon.color.set('#c5d4f2')
    moon.intensity = alt < TWILIGHT_RAD ? Math.max(look.moon, 0.9) : alt < 0 ? look.moon * 0.55 : 0
    // A sun below the horizon still owns the shadow map and blacks out the ground.
    sun.castShadow = alt > 0.02
    const dark = alt < 0.04
    const exposure = look.exposure * photoExposure()
    const exp = Number.isFinite(exposure) ? exposure : 0.5
    if (ctx.renderer) {
      ctx.renderer.toneMappingExposure = exp
      ctx.renderer.setClearColor(background)
    }
    const cloudiness = THREE.MathUtils.clamp(env.cloudiness ?? 0, 0, 1)
    const weather = env.weather ?? 'clear'
    applySky(alt, weather, cloudiness, exp)

    stars.points.renderOrder = -1
    stars.setNight(skyState.star)
    const density =
      weather === 'clear' ? 0.15 + cloudiness * 0.45 : weather === 'fog' ? 0.15 : 0.45 + cloudiness * 0.5
    const cover = weather === 'clear' ? 0.62 - cloudiness * 0.2 : 0.42 - cloudiness * 0.12
    const cloudColor = skyState.night > 0.55 ? '#7d8794' : skyState.sunset > 0.45 ? '#f0c4a4' : '#f4f6f8'
    clouds.set(density, cover, cloudColor)
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
    const span = Math.max(size.x, size.z, (project.terrain?.width ?? 0) * 0.5, 150)
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

    const glow = dark && project.environment.autoLights !== false
    paintWindows(glow)
    const autoSig = `${dark ? 1 : 0}|${env.autoLights ? 1 : 0}|${project.updatedAt}`
    if (autoSig !== autoKey) {
      autoKey = autoSig
      syncAutoLights(project, dark)
    }
    dressOutdoor()

    const bucket = Math.round(time * 2) / 2
    const cloudBucket = Math.round(cloudiness * 10) / 10
    const key = `${env.dayOfYear}|${bucket}|${Math.round(env.latitude)}|${Math.round((env.north ?? 0) * 8)}|${weather}|${cloudBucket}`
    if ((key === envKey && envReady) || key === pendingKey) return
    pendingKey = key
    if (typeof window === 'undefined') {
      envKey = key
      envReady = refreshEnv()
      if (!envReady) pendingKey = ''
      return
    }
    window.clearTimeout(envTimer)
    envTimer = window.setTimeout(() => {
      envKey = key
      envReady = refreshEnv()
      if (!envReady) pendingKey = ''
    }, 40)
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
      if (typeof window !== 'undefined') window.clearTimeout(envTimer)
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
