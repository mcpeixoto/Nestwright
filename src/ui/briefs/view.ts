import type { BriefCheck, BriefResult, Localized } from '../../model/briefs'

export interface BriefCheckRow {
  id: string
  ok: boolean
  mark: '✓' | '✗'
  label: string
  detail: string
}

export function briefText(text: Localized, language: string): string {
  return language === 'pt-PT' || language === 'pt' ? text.pt : text.en
}

/** Checks become labelled rows. Stars stay the score's own count. */
export function briefPanelView(
  result: BriefResult,
  language: string,
): { stars: BriefResult['stars']; rows: BriefCheckRow[] } {
  return {
    stars: result.stars,
    rows: result.checks.map((check) => rowFor(check, language)),
  }
}

function rowFor(check: BriefCheck, language: string): BriefCheckRow {
  return {
    id: check.id,
    ok: check.ok,
    mark: check.ok ? '✓' : '✗',
    label: briefText(check.label, language),
    detail: check.detail ? briefText(check.detail, language) : '',
  }
}

export function starMarks(count: number): string {
  const n = Math.max(0, Math.min(3, Math.floor(Number.isFinite(count) ? count : 0)))
  return `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`
}

export function formatAreaM2(value: number, language: string): string {
  const tag = language === 'pt-PT' || language === 'pt' ? 'pt-PT' : 'en'
  const amount = Number.isFinite(value) ? value : 0
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(amount)} m²`
}

export function areaLimitText(
  limits: { minFloorArea?: number; maxFloorArea?: number },
  language: string,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const min = limits.minFloorArea
  const max = limits.maxFloorArea
  if (min != null && max != null) {
    return tr('From {min} to {max}', { min: formatAreaM2(min, language), max: formatAreaM2(max, language) })
  }
  if (max != null) return tr('Up to {area}', { area: formatAreaM2(max, language) })
  if (min != null) return tr('At least {area}', { area: formatAreaM2(min, language) })
  return ''
}
