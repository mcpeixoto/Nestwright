import { BRIEFS, briefById, unlockedBriefs } from '../../model/briefs'
import { useSettings } from '../../settings'
import { beginProject } from '../session'
import { projectForBrief } from './projectForBrief'
import { briefText } from './view'

/** Fresh house named in the current language. A locked brief is refused. */
export function startBrief(id: string): boolean {
  const brief = briefById(id)
  if (!brief) return false
  if (!unlockedBriefs(useSettings.getState().briefStars).includes(id)) return false
  beginProject(projectForBrief(brief, briefText(brief.title, useSettings.getState().language)))
  return true
}

/** The following brief, once this one's stars have opened it. */
export function nextUnlockedBriefId(currentId: string, bestStars: Record<string, number>): string | undefined {
  const open = new Set(unlockedBriefs(bestStars))
  const ordered = [...BRIEFS].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const index = ordered.findIndex((brief) => brief.id === currentId)
  const next = index >= 0 ? ordered[index + 1] : undefined
  return next && open.has(next.id) ? next.id : undefined
}
