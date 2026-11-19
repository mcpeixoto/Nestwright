import { create } from 'zustand'
import { clampEvComp } from '../model/exposure'
import { qualityProfile, RENDER_SCALE_MAX, RENDER_SCALE_MIN } from '../view3d/render/quality'
import { combineBriefStars, normalizeBriefStars, raiseBriefStars } from './briefStars'

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'
export type AppLanguage = 'en' | 'pt-PT'
/** `auto` tries WebGPU and falls back to WebGL2; `webgl` forces the fallback. */
export type RendererBackendSetting = 'auto' | 'webgpu' | 'webgl'
/** AgX keeps saturated sun and lamp highlights from clipping to flat hues; ACES is the old look. */
export type ToneMapSetting = 'agx' | 'aces'
/** Cozy is the warm light default. Night is the pre-0.16 dark look. */
export type ThemeSetting = 'cozy' | 'night'

export interface Settings {
  units: 'metric' | 'imperial'
  graphicsQuality: GraphicsQuality
  language: AppLanguage
  /** Night is the pre-0.16 dark look. */
  theme: ThemeSetting
  showFps: boolean
  playerName: string
  playerColor: string
  continueLast: boolean
  mouseSensitivity: number
  invertY: boolean
  /** Seconds. 0 turns autosave off. */
  autosaveInterval: number
  /** 0.9–1.25, applied to the root font size. */
  uiScale: number
  /** Short names under the tool-rail icons. Absent in older saved settings. */
  railLabels: boolean
  /** Read when a 3D view is created. */
  backend: RendererBackendSetting
  /** 0 follows the graphics tier; otherwise 0.25–1 of the device pixel ratio. */
  renderScale: number
  /**
   * Pick the tier from a short benchmark the next time a 3D view opens. On for a fresh install
   * only (see `initialSettings`); the benchmark turns it off once it has chosen, and choosing a
   * tier by hand turns it off too, so it never runs again unless switched back on in Settings.
   */
  qualityAuto: boolean
  toneMapping: ToneMapSetting
  /** Exposure compensation in EV (−2…+2) on top of the metered auto-exposure. */
  exposureComp: number
  /** 0–100. Older saved settings omit these; normalize fills the defaults. */
  volumeMaster: number
  volumeEffects: number
  volumeAmbience: number
  muted: boolean
  /** Best star count per brief id. Older saved settings omit this. */
  briefStars: Record<string, number>
  /**
   * Absolute path of the local photo-to-3D converter (desktop app only). Empty falls back to
   * the NESTWRIGHT_PHOTO3D environment variable. Older saved settings omit this.
   */
  photo3dCommand: string
}

const KEY = 'nestwright:settings'

const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']
const BACKENDS: readonly RendererBackendSetting[] = ['auto', 'webgpu', 'webgl']
export const AUTOSAVE_CHOICES = [0, 5, 15, 30, 60, 120] as const

export const DEFAULT_SETTINGS: Settings = {
  units: 'metric',
  graphicsQuality: 'high',
  language: 'en',
  theme: 'cozy',
  showFps: false,
  playerName: '',
  playerColor: '#3FB8AF',
  continueLast: false,
  mouseSensitivity: 1,
  invertY: false,
  autosaveInterval: 15,
  uiScale: 1,
  railLabels: false,
  backend: 'auto',
  renderScale: 0,
  qualityAuto: false,
  toneMapping: 'agx',
  exposureComp: 0,
  volumeMaster: 80,
  volumeEffects: 70,
  volumeAmbience: 50,
  muted: false,
  briefStars: {},
  photo3dCommand: '',
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function normalizeSettings(partial: Partial<Settings> | null | undefined): Settings {
  const source = partial ?? {}
  const graphicsQuality = QUALITIES.includes(source.graphicsQuality as GraphicsQuality)
    ? (source.graphicsQuality as GraphicsQuality)
    : DEFAULT_SETTINGS.graphicsQuality
  const languageRaw = typeof (source as { language?: unknown }).language === 'string' ? String(source.language) : ''
  const language: AppLanguage = languageRaw === 'pt-PT' || languageRaw === 'pt' ? 'pt-PT' : 'en'
  const autosaveInterval = AUTOSAVE_CHOICES.includes(source.autosaveInterval as (typeof AUTOSAVE_CHOICES)[number])
    ? (source.autosaveInterval as number)
    : DEFAULT_SETTINGS.autosaveInterval
  return {
    units: source.units === 'imperial' ? 'imperial' : 'metric',
    graphicsQuality,
    language,
    theme: source.theme === 'night' ? 'night' : 'cozy',
    showFps: source.showFps === true,
    playerName: typeof source.playerName === 'string' ? source.playerName : '',
    playerColor:
      typeof source.playerColor === 'string' && source.playerColor ? source.playerColor : DEFAULT_SETTINGS.playerColor,
    continueLast: source.continueLast === true,
    mouseSensitivity: clamp(source.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity, 0.4, 2, 1),
    invertY: source.invertY === true,
    autosaveInterval,
    uiScale: clamp(source.uiScale ?? 1, 0.9, 1.25, 1),
    railLabels: source.railLabels === true,
    backend: BACKENDS.includes(source.backend as RendererBackendSetting)
      ? (source.backend as RendererBackendSetting)
      : DEFAULT_SETTINGS.backend,
    renderScale: normalizeRenderScale(source.renderScale),
    qualityAuto: source.qualityAuto === true,
    toneMapping: source.toneMapping === 'aces' ? 'aces' : 'agx',
    exposureComp: typeof source.exposureComp === 'number' ? clampEvComp(Math.round(source.exposureComp * 10) / 10) : 0,
    volumeMaster: volumePercent(source.volumeMaster, DEFAULT_SETTINGS.volumeMaster),
    volumeEffects: volumePercent(source.volumeEffects, DEFAULT_SETTINGS.volumeEffects),
    volumeAmbience: volumePercent(source.volumeAmbience, DEFAULT_SETTINGS.volumeAmbience),
    muted: source.muted === true,
    briefStars: normalizeBriefStars(source.briefStars),
    photo3dCommand: normalizeCommandPath(source.photo3dCommand),
  }
}

/** A path, trimmed, with surrounding quotes (from a pasted "Copy as pathname") removed. One line, capped. */
export function normalizeCommandPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  let text = value.replace(/[\r\n\0]/g, '').trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    text = text.slice(1, -1).trim()
  }
  return text.slice(0, 1024)
}

function volumePercent(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(value, 0, 100, fallback)
}

function normalizeRenderScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(RENDER_SCALE_MAX, Math.max(RENDER_SCALE_MIN, value))
}

/**
 * Settings from the stored JSON. Nothing stored means a fresh install, which gets the
 * first-launch tier benchmark; a saved file without the field keeps the tier its user chose.
 */
export function initialSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS, qualityAuto: true }
  return normalizeSettings(JSON.parse(raw) as Partial<Settings>)
}

/** A tier picked by hand ends the automatic choice, unless the same change re-enables it. */
export function mergeSettings(current: Settings, partial: Partial<Settings>): Settings {
  const next: Partial<Settings> = { ...current, ...partial }
  if (partial.graphicsQuality !== undefined && partial.qualityAuto === undefined) next.qualityAuto = false
  if (partial.briefStars !== undefined) next.briefStars = combineBriefStars(current.briefStars, partial.briefStars)
  return normalizeSettings(next)
}

function load(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
    return initialSettings(localStorage.getItem(KEY))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function persist(settings: Settings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY, JSON.stringify(normalizeSettings(settings)))
  } catch {
    /* private mode or a full disk: the in-memory settings still apply */
  }
}

interface SettingsState extends Settings {
  setSettings: (partial: Partial<Settings>) => void
}

/** Preferences that are not part of the project file. Later waves add fields here. */
export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setSettings(partial) {
    const next = mergeSettings(get(), partial)
    set(next)
    persist(next)
  },
}))

/** Preferences back to defaults. Brief progress is not a preference. */
export function resetSettings(): void {
  const next = normalizeSettings({ ...DEFAULT_SETTINGS, briefStars: useSettings.getState().briefStars })
  useSettings.setState(next)
  persist(next)
}

/** Stores a higher star count for one brief. Returns whether the saved count went up. */
export function commitBriefStars(id: string, stars: number): boolean {
  const current = useSettings.getState().briefStars
  const next = raiseBriefStars(current, id, stars)
  if (next === current) return false
  useSettings.getState().setSettings({ briefStars: next })
  return true
}

/** Thin wrappers over the tier profiles in `view3d/render/quality`. */
export function shadowMapSize(quality: GraphicsQuality): number {
  return qualityProfile(quality).shadowMapSize
}

export function pixelRatioCap(quality: GraphicsQuality): number {
  return qualityProfile(quality).pixelRatioCap
}

/** Scatter budgets read this. Placed furniture is unaffected. */
export function plantDensityMultiplier(quality: GraphicsQuality): number {
  return qualityProfile(quality).plantDensity
}
