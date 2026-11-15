import { BRIEFS, totalStars, unlockedBriefs } from '../../model/briefs'
import { formatMoney } from '../../model/money'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { useSettings } from '../../settings'
import { areaLimitText, briefText, starMarks } from '../briefs/view'
import { startBrief } from '../briefs/startBrief'
import { showStart } from '../session'

export function BriefsGallery() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const briefStars = useSettings((s) => s.briefStars)
  const open = new Set(unlockedBriefs(briefStars))
  const total = totalStars(briefStars)
  const max = BRIEFS.length * 3
  const briefs = [...BRIEFS].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

  return (
    <div className="glass gallery" role="dialog" aria-label={tr('House Briefs')}>
      <div className="gallery-head">
        <h1>
          <T k="House Briefs" />
        </h1>
        <span className="brief-total" aria-label={tr('{n} stars of {max}', { n: total, max })}>
          {total} / {max}
        </span>
        <button type="button" onClick={() => showStart()}>
          <T k="Back" />
        </button>
      </div>
      <div className="gallery-grid">
        {briefs.map((brief) => {
          const unlocked = open.has(brief.id)
          const earned = Math.min(3, Math.max(0, Math.floor(briefStars[brief.id] ?? 0)))
          const area = areaLimitText(brief, language, tr)
          const bits = [brief.budget != null ? formatMoney(brief.budget, 'EUR', language) : '', area].filter(Boolean)
          return (
            <button
              type="button"
              key={brief.id}
              className="gallery-card"
              disabled={!unlocked}
              onClick={() => startBrief(brief.id)}
            >
              <strong>{briefText(brief.title, language)}</strong>
              <span>{briefText(brief.summary, language)}</span>
              {bits.length > 0 && <span className="hint">{bits.join(' · ')}</span>}
              <span className="brief-stars" aria-label={tr('{n} stars', { n: earned })}>
                {starMarks(earned)}
              </span>
              {!unlocked && (
                <span>
                  <T k="Locked" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
