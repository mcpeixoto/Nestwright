import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../../audio/sfx'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { projectAreas } from '../../model/areas'
import { briefById, scoreBrief, type BriefResult, type HouseBrief } from '../../model/briefs'
import { estimateBudget } from '../../model/budget'
import { formatMoney } from '../../model/money'
import { commitBriefStars, useSettings } from '../../settings'
import { useStore } from '../../store'
import { icon } from '../../tools/icons'
import { nextUnlockedBriefId, startBrief } from '../briefs/startBrief'
import { areaLimitText, briefPanelView, formatAreaM2, starMarks } from '../briefs/view'
import { emitCelebrate } from '../events'
import { Modal } from '../Modal'
import { registerPanel, setPanelOpen } from './registry'

/** scoreBrief walks the house, so the card refreshes at most four times a second. */
const SCORE_EVERY_MS = 250

interface Submission {
  result: BriefResult
  budgetUsed: number
  areaUsed: number
  currency: string
  nextId?: string
}

function useBriefScore(brief: HouseBrief): BriefResult {
  const [result, setResult] = useState(() => scoreBrief(useStore.getState().project, brief))
  useEffect(() => {
    let last = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    let due = false
    const publish = () => {
      last = Date.now()
      due = false
      setResult(scoreBrief(useStore.getState().project, brief))
    }
    const schedule = () => {
      const elapsed = Date.now() - last
      if (elapsed >= SCORE_EVERY_MS) {
        if (timer) clearTimeout(timer)
        timer = undefined
        publish()
        return
      }
      due = true
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        if (due) publish()
      }, SCORE_EVERY_MS - elapsed)
    }
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.project === previous.project) return
      schedule()
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [brief])
  return result
}

function CheckList({ rows, passedLabel, failedLabel }: { rows: ReturnType<typeof briefPanelView>['rows']; passedLabel: string; failedLabel: string }) {
  return (
    <ul className="brief-checks">
      {rows.map((row) => (
        <li key={row.id} className={row.ok ? 'pass' : 'fail'}>
          <span className="mark" aria-label={row.ok ? passedLabel : failedLabel}>
            {row.mark}
          </span>
          <span>{row.label}</span>
          {row.detail ? <span className="detail">{row.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function BriefSummary({
  brief,
  submission,
  language,
  onClose,
}: {
  brief: HouseBrief
  submission: Submission
  language: string
  onClose: () => void
}) {
  const tr = useTranslate()
  const view = useMemo(() => briefPanelView(submission.result, language), [submission.result, language])
  const passed = view.rows.filter((row) => row.ok).length
  const failed = view.rows.length - passed
  const limit = areaLimitText(brief, language, tr)
  return (
    <Modal label={tr('Brief result')} onClose={onClose} className="brief-summary">
      <h2>
        <T k="Brief result" />
      </h2>
      <p className="brief-score" aria-label={tr('{n} stars', { n: view.stars })}>
        {starMarks(view.stars)}
      </p>
      <p>
        <T k="Passed" /> {passed} · <T k="Failed" /> {failed}
      </p>
      <CheckList rows={view.rows} passedLabel={tr('Passed')} failedLabel={tr('Failed')} />
      <div className="brief-usage">
        {brief.budget != null && (
          <p>
            <T k="Budget" /> ·{' '}
            {tr('{used} of {limit}', {
              used: formatMoney(submission.budgetUsed, submission.currency, language),
              limit: formatMoney(brief.budget, submission.currency, language),
            })}
          </p>
        )}
        {limit && (
          <p>
            <T k="Area" /> ·{' '}
            {brief.minFloorArea == null && brief.maxFloorArea != null
              ? tr('{used} of {limit}', {
                  used: formatAreaM2(submission.areaUsed, language),
                  limit: formatAreaM2(brief.maxFloorArea, language),
                })
              : `${formatAreaM2(submission.areaUsed, language)} · ${limit}`}
          </p>
        )}
      </div>
      <div className="budget-actions">
        {submission.nextId && (
          <button
            type="button"
            onClick={() => {
              const id = submission.nextId
              onClose()
              if (id) startBrief(id)
            }}
          >
            <T k="Next brief" />
          </button>
        )}
        <button type="button" onClick={onClose}>
          <T k="Close" />
        </button>
      </div>
    </Modal>
  )
}

function BriefBody({ brief }: { brief: HouseBrief }) {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const result = useBriefScore(brief)
  const view = useMemo(() => briefPanelView(result, language), [result, language])
  const [submission, setSubmission] = useState<Submission | null>(null)

  function submit() {
    const project = useStore.getState().project
    const scored = scoreBrief(project, brief)
    if (commitBriefStars(brief.id, scored.stars)) {
      sfx('unlock')
      emitCelebrate({ kind: 'unlock' })
    }
    setSubmission({
      result: scored,
      budgetUsed: estimateBudget(project).total,
      areaUsed: projectAreas(project).net,
      currency: project.budget?.currency ?? 'EUR',
      nextId: nextUnlockedBriefId(brief.id, useSettings.getState().briefStars),
    })
  }

  return (
    <div className="brief-panel">
      <p className="brief-score" aria-label={tr('{n} stars', { n: view.stars })}>
        {starMarks(view.stars)}
      </p>
      <CheckList rows={view.rows} passedLabel={tr('Passed')} failedLabel={tr('Failed')} />
      <button type="button" onClick={submit}>
        <T k="Submit" />
      </button>
      {submission && <BriefSummary brief={brief} submission={submission} language={language} onClose={() => setSubmission(null)} />}
    </div>
  )
}

export function BriefPanel() {
  const id = useStore((s) => s.project.brief?.id)
  const brief = id ? briefById(id) : undefined
  if (!brief) return null
  return <BriefBody key={brief.id} brief={brief} />
}

registerPanel({
  id: 'brief',
  title: 'House brief',
  placement: 'floating',
  icon: icon('<path d="m12 3 2.2 4.6L19 8.2l-3.5 3.4.8 4.9L12 14.2 7.7 16.5l.8-4.9L5 8.2l4.8-.6z"/>'),
  Component: BriefPanel,
})

useStore.subscribe((state, previous) => {
  const next = state.project.brief?.id
  const prior = previous.project.brief?.id
  if (next && next !== prior) setPanelOpen('brief', true)
  if (!next && prior) setPanelOpen('brief', false)
})
