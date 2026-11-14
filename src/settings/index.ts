import { create } from 'zustand'
import { qualityProfile, RENDER_SCALE_MAX, RENDER_SCALE_MIN } from '../view3d/render/quality'

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'
export type AppLanguage = 'en' | 'pt-PT'
/** `auto` tries WebGPU and falls back to WebGL2; `webgl` forces the fallback. */
export type RendererBackendSetting = 'auto' | 'webgpu' | 'webgl'

export interface Settings {
  units: 'metric' | 'imperial'
  graphicsQuality: GraphicsQuality
  language: AppLanguage
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
}

const KEY = 'nestwright:settings'

const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']
const BACKENDS: readonly RendererBackendSetting[] = ['auto', 'webgpu', 'webgl']
export const AUTOSAVE_CHOICES = [0, 5, 15, 30, 60, 120] as const

export const DEFAULT_SETTINGS: Settings = {
  units: 'metric',
  graphicsQuality: 'high',
  language: 'en',
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
  }
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
