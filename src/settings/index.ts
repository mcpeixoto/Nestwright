import { create } from 'zustand'

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'

export interface Settings {
  units: 'metric' | 'imperial'
  graphicsQuality: GraphicsQuality
  language: string
  showFps: boolean
  playerName: string
  playerColor: string
}

const KEY = 'nestwright:settings'

const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']

export const DEFAULT_SETTINGS: Settings = {
  units: 'metric',
  graphicsQuality: 'high',
  language: 'en',
  showFps: false,
  playerName: '',
  playerColor: '#3FB8AF',
}

function load(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    const graphicsQuality = QUALITIES.includes(parsed.graphicsQuality as GraphicsQuality)
      ? (parsed.graphicsQuality as GraphicsQuality)
      : DEFAULT_SETTINGS.graphicsQuality
    const units = parsed.units === 'imperial' ? 'imperial' : 'metric'
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      units,
      graphicsQuality,
      language: typeof parsed.language === 'string' && parsed.language ? parsed.language : DEFAULT_SETTINGS.language,
      showFps: parsed.showFps === true,
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
      playerColor: typeof parsed.playerColor === 'string' && parsed.playerColor ? parsed.playerColor : DEFAULT_SETTINGS.playerColor,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function persist(settings: Settings): void {
  try {
    if (typeof localStorage === 'undefined') return
    const stored: Settings = {
      units: settings.units,
      graphicsQuality: settings.graphicsQuality,
      language: settings.language,
      showFps: settings.showFps,
      playerName: settings.playerName,
      playerColor: settings.playerColor,
    }
    localStorage.setItem(KEY, JSON.stringify(stored))
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
    set(partial)
    const { units, graphicsQuality, language, showFps, playerName, playerColor } = get()
    persist({ units, graphicsQuality, language, showFps, playerName, playerColor })
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
