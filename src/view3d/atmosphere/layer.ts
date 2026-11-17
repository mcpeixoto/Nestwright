import * as THREE from 'three'
import type { Environment, Project } from '../../model/types'
import { SUN_PEAK_INTENSITY, sunDirection, sunLook, TWILIGHT_RAD } from '../../model/sunLook'
import { exteriorWindowSpills } from '../../model/windowSpill'
import { useSettings, type ToneMapSetting } from '../../settings'
import { castFoliageShadows, setFoliageSun } from '../lighting/foliage'
import { shadowFocus } from '../lighting/focus'
import { createOutdoorLights } from '../lighting/outdoorLights'
import { pickSpills, SPILL_SLOTS } from '../lighting/spillPool'
import { createSunShadow } from '../lighting/sunShadow'
import { rendererBackend } from '../render/createRenderer'
import { renderingHeld } from '../render/hold'
import type { SceneLayer, SceneLayerContext, SceneViewState } from '../layers'
import { photoExposure } from '../../ui/photoSession'
import { clockTime } from './clock'
import { createClouds } from './clouds'
import { createGradedSky, type GradedSky, type SkyGrade } from './gradeSky'
import { createPrecip, driftPrecip } from './precip'
import { autoExposureState, stepAutoExposure } from '../post/autoExposure'
import { aoIndirectCap, aoStrength } from '../post/effects'

/**
 * GTAO weight and indirect-share cap with the camera in a room (1 and 0.5 outside). The
 * weight stays 1: above it, GTAO on normal-mapped roof tiles seen through a cutaway turned the
 * tile gaps black, with no measurable gain in the rooms. The higher share cap lets AO darken
 * more of each pixel indoors, where nearly all light is indirect.
 */
const INDOOR_AO_STRENGTH = 1
const INDOOR_AO_INDIRECT_CAP = 0.8
import { createSkyParams, DAY_HEMI_INTENSITY, ENV_INTENSITY, writeSkyParams, type SkyParams } from './skyParams'
import { createStars } from './stars'
import { activeTone, rendererExposure, toneMappingFor } from './toneMap'
import { dressOutdoorMesh, isOutdoorMesh, setWeatherMix } from './weather'

/** Added before tone mapping so the disc clips to a warm white, not a green blob. */
const SUN_DISC: readonly [number, number, number] = [14, 8.2, 2.4]

const fallbackEnv: Environment = {
  dayOfYear: 172,
  time: 15.5,
  latitude: 41,
  north: 0,
  weather: 'clear',
  cloudiness: 0.12,
  autoLights: true,
}

/**
 * The Preetham parameters (turbidity, rayleigh, mie) in SkyParams fed only the sun direction
 * once the fragment colour was graded, so the dome takes the graded colours directly.
 */
function paintSky(sky: GradedSky, unit: THREE.Vector3, showSun: boolean, grade: SkyGrade, light: boolean, params: SkyParams): void {
  sky.sunDirection.copy(unit)
  sky.setShowSun(showSun)
  const zenith = light ? params.zenithLight : params.zenithScene
  const horizon = light ? params.horizonLight : params.horizonScene
  grade.zenith.setRGB(zenith[0], zenith[1], zenith[2])
  grade.horizon.setRGB(horizon[0], horizon[1], horizon[2])
  // Only the lighting dome gets ground bounce; terrain covers the visible dome's lower half.
  const ground = light ? params.groundLight : horizon
  grade.ground.setRGB(ground[0], ground[1], ground[2])
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
    ctx.renderer.toneMapping = toneMappingFor(activeTone())
    ctx.renderer.toneMappingExposure = 0.5
    ctx.renderer.shadowMap.enabled = true
    ctx.renderer.shadowMap.type = THREE.PCFShadowMap
  }

  const skyGrade: SkyGrade = { zenith: new THREE.Color(), horizon: new THREE.Color(), sunDisc: new THREE.Color(), ground: new THREE.Color() }
  const envGrade: SkyGrade = { zenith: new THREE.Color(), horizon: new THREE.Color(), sunDisc: new THREE.Color(), ground: new THREE.Color() }
  const skyDome = createGradedSky(skyGrade)
  const sky = skyDome.mesh
  sky.scale.setScalar(480)
  sky.frustumCulled = false
  sky.name = 'sky'
  scene.add(sky)

  const envDome = createGradedSky(envGrade)
  envDome.mesh.scale.setScalar(80)
  const envScene = new THREE.Scene()
  envScene.add(envDome.mesh)

  // The one shadow-casting directional light: the sun by day, the moon by night. It never
  // drops castShadow, so nightfall does not recompile every material.
  const sun = new THREE.DirectionalLight('#fff4e0', SUN_PEAK_INTENSITY)
  sun.name = 'sun'
  sun.castShadow = true
  scene.add(sun)
  scene.add(sun.target)
  const sunShadow = createSunShadow(sun, ctx.camera)
  const outdoorLights = createOutdoorLights(scene)

  // Unshadowed fill: the moon by day (off), the sun's afterglow by night.
  const moon = new THREE.DirectionalLight('#c5d4ff', 0)
  moon.name = 'moon'
  scene.add(moon)
  scene.add(moon.target)

  const hemi = new THREE.HemisphereLight('#b7cbe4', '#4a5538', DAY_HEMI_INTENSITY)
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
  const spillLights: THREE.PointLight[] = []
  for (let i = 0; i < SPILL_SLOTS; i++) {
    const lamp = new THREE.PointLight('#ffb15a', 0, 8.5, 2)
    lamp.castShadow = false
    lamp.name = `window-spill-${i}`
    autoLights.add(lamp)
    spillLights.push(lamp)
  }
  let spills: { x: number; y: number; z: number }[] = []
  let autoOn = false

  const pmrem = ctx.renderer ? new THREE.PMREMGenerator(ctx.renderer) : null
  let envTarget: { texture: THREE.Texture; dispose(): void } | null = null
  let envKey = ''
  let envReady = false
  let project: Project | null = null
  let view: SceneViewState | null = null
  const unit = new THREE.Vector3(0.35, 0.78, 0.25).normalize()
  let autoKey = ''
  let lastGlow: boolean | null = null
  // Layers that sync after this one (ground, outside) build their meshes then; the next frame dresses them.
  let dirty = true
  let foliageFrame = 0
  const moonDir = new THREE.Vector3()
  const camPos = new THREE.Vector3()
  let envTimer = 0
  /** Seconds since apply() last advanced the auto-exposure. */
  let frameDt = 0
  let pendingKey = ''
  const background = new THREE.Color()
  const skyState = createSkyParams()
  let skyKey = ''
  const fog = new THREE.Fog(0x000000, skyState.fogNear, skyState.fogFar)
  scene.fog = fog
  scene.background = background
  sky.renderOrder = -2

  const applySky = (alt: number, weather: string, cloudiness: number, exposure: number, tone: ToneMapSetting) => {
    const nextKey = `${alt.toFixed(3)}|${weather}|${cloudiness.toFixed(2)}|${exposure.toFixed(3)}|${tone}`
    if (nextKey === skyKey) return
    skyKey = nextKey
    writeSkyParams(alt, weather, cloudiness, exposure, skyState, tone)
    paintSky(skyDome, unit, skyState.sunDisc > 0, skyGrade, false, skyState)
    paintSky(envDome, unit, false, envGrade, true, skyState)
    fog.near = skyState.fogNear
    fog.far = skyState.fogFar
    fog.color.setRGB(skyState.horizonScene[0], skyState.horizonScene[1], skyState.horizonScene[2])
    background.copy(fog.color)
    hemi.color.set(skyState.hemiSky)
    hemi.groundColor.set(skyState.hemiGround)
    hemi.intensity = skyState.hemiIntensity
  }
  applySky(0.7, 'clear', 0.12, 0.5, activeTone())

  const refreshEnv = (): boolean => {
    if (!pmrem || !ctx.renderer || ctx.renderer.domElement.clientWidth < 2) return false
    // A precompile owns the renderer state; update() retries once it is done (envReady stays false).
    if (renderingHeld()) return false
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

  /**
   * Window spill lights are kept for the project's life and dimmed by day, so dusk does
   * not change the light count. Lamps are doubled at night by the lamp pool
   * (scene.userData.lampNight) instead of getting a twin light here.
   */
  const syncAutoLights = (source: Project, night: boolean) => {
    autoOn = source.environment.autoLights !== false && night
    scene.userData.lampNight = autoOn
    spills = source.levels.flatMap((level) => exteriorWindowSpills(level))
    placeSpills()
  }

  /** Move the fixed spill lights onto the spills nearest the camera (see spillPool). */
  const placeSpills = () => {
    ctx.camera.getWorldPosition(camPos)
    const chosen = pickSpills(spills, camPos, spillLights.length)
    spillLights.forEach((lamp, i) => {
      const spill = spills[chosen[i] ?? -1]
      if (spill) lamp.position.set(spill.x, spill.y, spill.z)
      lamp.intensity = spill && autoOn ? 14 : 0
    })
  }

  const dressOutdoor = () => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const terrain = mesh.userData.kind === 'terrain'
      const outdoor = isOutdoorMesh(mesh)
      if (!outdoor && !terrain) return
      // Outdoor meshes first swap to their `|outdoor` material twins (weather lives only there),
      // so the outdoor light list below never lands on a shared indoor library material.
      if (outdoor) dressOutdoorMesh(mesh)
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of list) {
        if (material) outdoorLights.apply(material)
      }
    })
  }

  const apply = (full: boolean) => {
    if (!project || !view) return
    const env = project.environment ?? fallbackEnv
    const time = clockTime(env.time ?? 12)
    const vec = sunDirection(env.dayOfYear ?? 172, time, env.latitude ?? 41, env.north ?? 0)
    unit.set(vec.x, vec.y, vec.z)
    if (unit.lengthSq() < 1e-8) unit.set(0.2, 0.4, 0.2)
    unit.normalize()
    const alt = Math.asin(THREE.MathUtils.clamp(unit.y, -1, 1))
    const look = sunLook(alt)
    const moonIntensity = alt < TWILIGHT_RAD ? Math.max(look.moon, 0.9) : alt < 0 ? look.moon * 0.55 : 0
    // A sun below the horizon would own the shadow map and black out the ground, so the
    // shadowed key light becomes the moon (opposite the sun, held at least ~25° up).
    const sunKey = alt > 0.02
    moonDir.copy(unit).negate()
    if (moonDir.y < 0.42) {
      const flat = Math.hypot(moonDir.x, moonDir.z) || 1
      const k = Math.sqrt(1 - 0.42 * 0.42) / flat
      moonDir.set(moonDir.x * k, 0.42, moonDir.z * k)
    }
    if (sunKey) {
      sun.color.setRGB(look.r, look.g, look.b)
      sun.intensity = look.intensity
      moon.color.set('#c5d4f2')
      moon.intensity = moonIntensity
    } else {
      sun.color.set('#c5d4f2')
      sun.intensity = moonIntensity
      moon.color.setRGB(look.r, look.g, look.b)
      moon.intensity = look.intensity
    }
    const dark = alt < 0.04
    // The sun look's exposure is the base the sky and fog are authored against; metering and
    // compensation sit on top, so an interior that opens up lets its windows burn.
    const exp = Number.isFinite(look.exposure) ? look.exposure : 0.5
    // Lamps scale to the ambient they are seen against (lampSceneGain): weak by day, a
    // clear pool at night. The lamp layer reads this every frame.
    scene.userData.lampDaylight = look.daylight
    ctx.camera.getWorldPosition(camPos)
    const focus = shadowFocus(project, view, camPos, ctx.camera.near)
    const compensation = useSettings.getState().exposureComp + photoExposure()
    const gain = stepAutoExposure(frameDt, exp, focus.indoor, compensation, look.daylight, look.climb)
    frameDt = 0
    // Rooms lean on contact shadows (furniture undersides, corners) far more than exteriors:
    // occlusion grows with the smoothed indoor share, so exteriors keep their tuned AO.
    const inside = autoExposureState().indoor
    aoStrength.value = 1 + (INDOOR_AO_STRENGTH - 1) * inside
    aoIndirectCap.value = 0.5 + (INDOOR_AO_INDIRECT_CAP - 0.5) * inside
    const tone = activeTone()
    if (ctx.renderer) {
      ctx.renderer.toneMapping = toneMappingFor(tone)
      ctx.renderer.toneMappingExposure = rendererExposure(exp * gain, tone)
      ctx.renderer.setClearColor(background)
    }
    const cloudiness = THREE.MathUtils.clamp(env.cloudiness ?? 0, 0, 1)
    const weather = env.weather ?? 'clear'
    applySky(alt, weather, cloudiness, exp, tone)

    stars.points.renderOrder = -1
    stars.setNight(skyState.star)
    const nextQuality = useSettings.getState().graphicsQuality
    precip.set(weather, weather === 'clear' ? cloudiness : 0.7, nextQuality)
    setWeatherMix(weather === 'rain' ? 0.82 : weather === 'fog' ? 0.2 : 0, weather === 'snow' ? 0.4 + cloudiness * 0.6 : 0)

    const box = boundsOf(project, view)
    const center = box.getCenter(new THREE.Vector3())
    const keyDir = sunKey ? unit : moonDir
    clouds.set({
      coverage: skyState.cloudCoverage,
      density: skyState.cloudDensity,
      lit: skyState.cloudLitScene,
      shade: skyState.cloudShadeScene,
      horizon: skyState.horizonScene,
      sun: keyDir,
      day: 1 - skyState.night,
    })
    sun.target.position.copy(center)
    sun.position.copy(center).addScaledVector(keyDir, 60)
    setFoliageSun(keyDir, sun.color, sun.intensity)
    const fillDir = sunKey ? moonDir : unit
    moon.target.position.copy(center)
    moon.position.copy(center).addScaledVector(fillDir, 60)
    sunShadow.update({
      tier: nextQuality,
      focus,
      night: !sunKey,
      active: sun.intensity > 0.02,
      webgl: rendererBackend(ctx.renderer) === 'webgl2',
      revision: `${project.updatedAt}`,
    })

    // Both walk the whole scene, so they run when something changed (a sync, the glow flipping,
    // the periodic catch-up for meshes other layers build later), not every frame.
    const glow = dark && project.environment.autoLights !== false
    if (full || glow !== lastGlow) {
      lastGlow = glow
      paintWindows(glow)
    }
    const autoSig = `${dark ? 1 : 0}|${env.autoLights ? 1 : 0}|${project.updatedAt}`
    if (autoSig !== autoKey) {
      autoKey = autoSig
      syncAutoLights(project, dark)
    }
    if (full) dressOutdoor()

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
        apply(true)
        dirty = true
      } catch (err) {
        console.error(err)
      }
    },
    update(dt, elapsed) {
      try {
        frameDt += Number.isFinite(dt) && dt > 0 ? dt : 0
        sky.position.copy(ctx.camera.position)
        clouds.mesh.position.copy(ctx.camera.position)
        stars.points.position.copy(ctx.camera.position)
        clouds.drift(elapsed)
        driftPrecip(precip.group, elapsed)
        if (!project || !view) return
        if (!envReady) envReady = refreshEnv()
        const tick = foliageFrame++
        if (tick % 30 === 0) castFoliageShadows(scene, useSettings.getState().graphicsQuality)
        if (tick % 15 === 0 && spills.length > spillLights.length) placeSpills()
        outdoorLights.update()
        // A full pass every second picks up meshes other layers built after the last sync.
        apply(dirty || tick % 60 === 0)
        dirty = false
      } catch (err) {
        console.error(err)
      }
    },
    dispose() {
      if (typeof window !== 'undefined') window.clearTimeout(envTimer)
      sunShadow.dispose()
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
      skyDome.dispose()
      envDome.dispose()
      clouds.dispose()
      stars.dispose()
      precip.dispose()
    },
  }
}
