import { BRIEFS } from './catalog'

function byOrder() {
  return [...BRIEFS].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

function starsOf(bestStars: Record<string, number>, id: string): number {
  const stars = bestStars[id]
  if (typeof stars !== 'number' || !Number.isFinite(stars) || stars <= 0) return 0
  return stars
}

/** Brief 1 is always open. Brief n+1 opens once brief n has at least one star. */
export function unlockedBriefs(bestStars: Record<string, number>): string[] {
  const briefs = byOrder()
  const ids: string[] = []
  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i]
    if (!brief) continue
    if (i === 0) {
      ids.push(brief.id)
      continue
    }
    const prev = briefs[i - 1]
    if (!prev || starsOf(bestStars, prev.id) < 1) break
    ids.push(brief.id)
  }
  return ids
}

/** Sum of the best star count for each catalog brief. Unknown ids are ignored. Each brief counts at most 3. */
export function totalStars(bestStars: Record<string, number>): number {
  let sum = 0
  for (const brief of BRIEFS) {
    sum += Math.min(3, Math.floor(starsOf(bestStars, brief.id)))
  }
  return sum
}
