import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import type { TourStep } from './logic'

const WIDTH = 280
const GAP = 12

interface Placement {
  found: boolean
  below: boolean
  left: number
  top: number
}

function measure(anchor: string | undefined): Placement {
  const none = { found: false, below: false, left: 0, top: 0 }
  if (!anchor || typeof document === 'undefined') return none
  const element = document.querySelector('[data-tour="' + anchor + '"]')
  if (!element) return none
  const rect = element.getBoundingClientRect()
  const right = rect.right + GAP
  if (right + WIDTH <= window.innerWidth) return { found: true, below: false, left: right, top: rect.top }
  const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - WIDTH - GAP))
  return { found: true, below: true, left, top: rect.bottom + GAP }
}

export function CoachMark({
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep
  index: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const tr = useTranslate()
  const [place, setPlace] = useState<Placement>(() => measure(step.anchor))

  useLayoutEffect(() => {
    const update = () => setPlace(measure(step.anchor))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [index, step.anchor])

  const classes = ['coach-mark']
  if (!place.found) classes.push('centered')
  else if (place.below) classes.push('below')
  const style: CSSProperties | undefined = place.found ? { left: place.left, top: place.top } : undefined

  return createPortal(
    <aside
      role="dialog"
      className={classes.join(' ')}
      data-anchor={place.found ? step.anchor : undefined}
      aria-label={tr(step.titleKey)}
      style={style}
    >
      <span className="arrow" />
      <p className="hint">{tr('Step {n} of {total}', { n: index + 1, total })}</p>
      <h2>
        <T k={step.titleKey} />
      </h2>
      <p>
        <T k={step.bodyKey} />
      </p>
      <div className="dots">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i === index ? 'on' : ''} />
        ))}
      </div>
      <div className="row">
        <button type="button" disabled={index === 0} onClick={onBack}>
          <T k="Back" />
        </button>
        <button type="button" onClick={onSkip}>
          <T k="Skip" />
        </button>
        <button type="button" className="start-primary" onClick={onNext}>
          <T k="Next" />
        </button>
      </div>
    </aside>,
    document.body,
  )
}
