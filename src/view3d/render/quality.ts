import type { GraphicsQuality } from '../../settings'

/**
 * One row per graphics tier. Every later realism step reads its switches from here, so a
 * tier change is one lookup and not a scatter of `quality === 'low'` checks. Effects that
 * are not built yet still have their flag, so the post-processing chain can list them.
 */
export interface QualityProfile {
  tier: GraphicsQuality
  /** Fraction of CSS px × devicePixelRatio that is actually rendered. */
  renderScale: number
  /** Pre-0.5 device-pixel-ratio ceiling. Kept for callers of `pixelRatioCap()`; the renderer uses renderScale. */
  pixelRatioCap: number
  shadowMapSize: number
  /** Lamps that may cast a shadow at once. */
  lampShadowSlots: number
  /** Multiplier on scatter budgets (plants, precipitation). Placed furniture is unaffected. */
  plantDensity: number
  effects: QualityEffects
}

export interface QualityEffects {
  bloom: boolean
  gtao: boolean
  ssr: boolean
  ssgi: boolean
  traa: boolean
  fxaa: boolean
}

const PROFILES: Record<GraphicsQuality, QualityProfile> = {
  low: {
    tier: 'low',
    renderScale: 0.5,
    pixelRatioCap: 1,
    shadowMapSize: 512,
    lampShadowSlots: 2,
    plantDensity: 0.35,
    effects: { bloom: false, gtao: false, ssr: false, ssgi: false, traa: false, fxaa: true },
  },
  medium: {
    tier: 'medium',
    renderScale: 0.67,
    pixelRatioCap: 1.5,
    shadowMapSize: 1024,
    lampShadowSlots: 4,
    plantDensity: 0.65,
    effects: { bloom: true, gtao: true, ssr: false, ssgi: false, traa: true, fxaa: false },
  },
  high: {
    tier: 'high',
    renderScale: 0.8,
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    lampShadowSlots: 4,
    plantDensity: 1,
    effects: { bloom: true, gtao: true, ssr: true, ssgi: false, traa: true, fxaa: false },
  },
  ultra: {
    tier: 'ultra',
    renderScale: 1,
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    lampShadowSlots: 4,
    plantDensity: 1.35,
    effects: { bloom: true, gtao: true, ssr: true, ssgi: true, traa: true, fxaa: false },
  },
}

export function qualityProfile(tier: GraphicsQuality): QualityProfile {
  return PROFILES[tier] ?? PROFILES.high
}

export const RENDER_SCALE_MIN = 0.25
export const RENDER_SCALE_MAX = 1

/** The user's render scale when set, the tier's otherwise; always within [0.25, 1]. */
export function effectiveRenderScale(tier: GraphicsQuality, override: number | null | undefined): number {
  const value = override != null && Number.isFinite(override) && override > 0 ? override : qualityProfile(tier).renderScale
  return Math.min(RENDER_SCALE_MAX, Math.max(RENDER_SCALE_MIN, value))
}

/**
 * Renderer pixel ratio: devicePixelRatio × render scale. The canvas backing store is then
 * CSS size × this, and the compositor scales it to the element.
 */
export function renderPixelRatio(devicePixelRatio: number, tier: GraphicsQuality, renderScale: number | null | undefined): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 3) : 1
  return Math.max(0.25, dpr * effectiveRenderScale(tier, renderScale))
}
