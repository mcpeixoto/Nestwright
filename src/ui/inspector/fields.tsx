import { useRef, useState } from 'react'
import { useTranslate } from '../../i18n'
import { formatLengthInput, parseLength } from '../../model/units'
import { selectActiveLevel, useStore } from '../../store'

export function patchLevel(label: string, recipe: (level: NonNullable<ReturnType<typeof selectActiveLevel>>) => void) {
  const id = useStore.getState().activeLevelId
  useStore.getState().apply(label, (draft) => {
    const level = draft.levels.find((item) => item.id === id)
    if (level) recipe(level)
  })
}

export function labelOf(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function NumberField({
  label,
  value,
  step,
  onCommit,
}: {
  label: string
  value: number
  step: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const tr = useTranslate()
  const shown = text ?? trimNumber(value)
  return (
    <label className="field">
      {tr(label)}
      <input
        inputMode="decimal"
        aria-label={tr(label)}
        step={step}
        value={shown}
        onFocus={() => setText(trimNumber(value))}
        onChange={(event) => {
          setText(event.target.value)
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onCommit(next)
        }}
        onBlur={() => setText(null)}
      />
    </label>
  )
}

function trimNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * A length in the project's units. Accepts `3.5`, `3,5 m`, `350 cm`, `11' 4"` and
 * friends (see `parseLength`); commits on Enter or blur, Escape reverts. `onCommit`
 * returns false when the model refused the value, which marks the field invalid.
 */
export function LengthField({
  label,
  value,
  onCommit,
  min = 0,
  max = Infinity,
  allowZero = false,
}: {
  label: string
  value: number
  onCommit: (metres: number) => boolean | void
  min?: number
  max?: number
  allowZero?: boolean
}) {
  const units = useStore((s) => s.project.units)
  const tr = useTranslate()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  const shown = text ?? formatLengthInput(value, units)

  const commit = (): boolean => {
    if (text == null) return true
    const metres = parseLength(text, units, { allowZero })
    if (metres == null || metres < min - 1e-9 || metres > max + 1e-9) {
      setError('Not a valid length')
      return false
    }
    if (onCommit(metres) === false) {
      setError('Doesn’t fit there')
      return false
    }
    setError(null)
    setText(null)
    return true
  }

  return (
    <label className={error ? 'field invalid' : 'field'}>
      {tr(label)}
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        aria-label={tr(label)}
        aria-invalid={error ? true : undefined}
        title={error ? tr(error) : tr(units === 'metric' ? 'e.g. 3.5 m or 350 cm' : 'e.g. 11\' 4"')}
        value={shown}
        onFocus={(event) => {
          cancelled.current = false
          setText(formatLengthInput(value, units))
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (commit()) {
              cancelled.current = true
              event.currentTarget.blur()
            }
          } else if (event.key === 'Escape') {
            cancelled.current = true
            setText(null)
            setError(null)
          }
        }}
        onBlur={() => {
          if (!cancelled.current && text != null && !commit()) {
            setText(null)
            setError(null)
          }
          cancelled.current = false
          setText(null)
        }}
      />
      {error ? <span className="field-error" role="alert">{tr(error)}</span> : null}
    </label>
  )
}
