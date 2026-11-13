import { create } from 'zustand'

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'
export type AppLanguage = 'en' | 'pt-PT'

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
}

const KEY = 'nestwright:settings'

const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']
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
  }
}

function load(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return normalizeSettings(JSON.parse(raw) as Partial<Settings>)
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
    const next = normalizeSettings({ ...get(), ...partial })
    set(next)
    persist(next)
  },
}))

export function shadowMapSize(quality: GraphicsQuality): number {
  if (quality === 'low') return 512
  if (quality === 'medium') return 1024
  if (quality === 'ultra') return 4096
  return 2048
}

export function pixelRatioCap(quality: GraphicsQuality): number {
  if (quality === 'low') return 1
  if (quality === 'medium') return 1.5
  return 2
}

/** Scatter budgets read this. Placed furniture is unaffected. */
export function plantDensityMultiplier(quality: GraphicsQuality): number {
  if (quality === 'low') return 0.35
  if (quality === 'medium') return 0.65
  if (quality === 'ultra') return 1.35
  return 1
}
