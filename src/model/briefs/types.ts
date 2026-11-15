import type { RoomType } from '../types'

/** Copy in English and in European Portuguese. */
export interface Localized {
  en: string
  pt: string
}

/** One counted room a brief asks for. `minArea` is net floor area, m². */
export interface BriefRoom {
  type: RoomType
  count: number
  /** Net floor area each of these rooms must reach, m². */
  minArea?: number
}

/**
 * A scenario the player designs a house for. Plot size is metres, centred on the
 * origin. `slope` is rise over depth, from flat (0) to a steep site (0.25).
 * `budget` caps `estimateBudget(project).total` in euros.
 */
export interface HouseBrief {
  id: string
  /** 1–12. Brief n+1 unlocks once brief n has at least one star. */
  order: number
  title: Localized
  summary: Localized
  plot: { width: number; depth: number; slope?: number }
  budget?: number
  /** Net indoor floor area cap, m² (`projectAreas().net`). */
  maxFloorArea?: number
  /** Net indoor floor area floor, m². */
  minFloorArea?: number
  rooms: BriefRoom[]
  levels?: { max?: number; min?: number }
  /** Required rooms on the lowest level, and every door at least 0.85 m wide. */
  accessible?: boolean
  /** Every bedroom, living room and kitchen has a window of at least one tenth of its net area. */
  daylight?: boolean
}

export interface BriefCheck {
  id: string
  ok: boolean
  label: Localized
  detail?: Localized
}

export interface BriefResult {
  checks: BriefCheck[]
  stars: 0 | 1 | 2 | 3
}
