import { useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { useTranslate } from '../../i18n'
import { formatLengthInput, parseLength } from '../../model/units'
import { selectActiveLevel, useStore } from '../../store'
import { Tooltip } from '../Tooltip'

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

interface CommitFieldOptions {
  /** The committed value, formatted for display. */
  format: () => string
  /** Parses the typed text; null means invalid. */
  parse: (text: string) => number | null
  invalid: string
  onCommit: (value: number) => boolean | void
}

/**
 * The shared text-field state machine: edits stay local until Enter or blur commit them,
 * Escape reverts, a parse failure shows `invalid`, a refused commit shows `Doesn’t fit there`.
 */
function useCommitField({ format, parse, invalid, onCommit }: CommitFieldOptions) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)

  const commit = (): boolean => {
    if (text == null) return true
    const value = parse(text)
    if (value == null) {
      setError(invalid)
      return false
    }
    if (onCommit(value) === false) {
      setError('Doesn’t fit there')
      return false
    }
    setError(null)
    setText(null)
    return true
  }

  const inputProps = {
    type: 'text',
    inputMode: 'decimal' as const,
    spellCheck: false,
    'aria-invalid': error ? true : undefined,
    value: text ?? format(),
    onFocus: (event: FocusEvent<HTMLInputElement>) => {
      cancelled.current = false
      setText(format())
      event.currentTarget.select()
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setText(event.target.value)
      setError(null)
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
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
    },
    onBlur: () => {
      if (!cancelled.current && text != null && !commit()) {
        setText(null)
        setError(null)
      }
      cancelled.current = false
      setText(null)
    },
  }
  return { error, inputProps }
}

function CommitField({
  label,
  hint,
  field,
}: {
  label: string
  hint: string
  field: ReturnType<typeof useCommitField>
}) {
  const tr = useTranslate()
  const { error, inputProps } = field
  return (
    <label className={error ? 'field invalid' : 'field'}>
      {tr(label)}
      <Tooltip label={error ? tr(error) : tr(hint)}>
        <input {...inputProps} aria-label={tr(label)} />
      </Tooltip>
      {error ? <span className="field-error" role="alert">{tr(error)}</span> : null}
    </label>
  )
}

/**
 * A length in the project's units. Accepts `3.5`, `3,5 m`, `350 cm`, `11' 4"` and
 * friends (see `parseLength`); commits on Enter or blur, Escape reverts. `onCommit`
 * returns false when the model refused the value, which marks the field invalid.
 * A leading `-` is accepted when `min` is negative.
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
  const field = useCommitField({
    format: () => formatLengthInput(value, units),
    parse: (text) => {
      const trimmed = text.trim()
      const negative = min < 0 && trimmed.startsWith('-')
      const parsed = parseLength(negative ? trimmed.slice(1) : trimmed, units, { allowZero: allowZero || negative })
      if (parsed == null) return null
      const metres = negative ? -parsed : parsed
      if (metres < min - 1e-9 || metres > max + 1e-9) return null
      return metres
    },
    invalid: 'Not a valid length',
    onCommit,
  })
  return <CommitField label={label} hint={units === 'metric' ? 'e.g. 3.5 m or 350 cm' : 'e.g. 11\' 4"'} field={field} />
}

function readNumber(text: string, suffix: RegExp): number | null {
  const cleaned = text.trim().replace(suffix, '').trim().replace(',', '.')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** An angle in degrees, shown as `45°`; wraps into `[min, max)`. Rejects negatives when `min` is 0. */
export function AngleField({
  label,
  value,
  onCommit,
  min = 0,
  max = 360,
}: {
  label: string
  value: number
  onCommit: (degrees: number) => boolean | void
  min?: number
  max?: number
}) {
  const field = useCommitField({
    format: () => `${trimNumber(value)}°`,
    parse: (text) => {
      const degrees = readNumber(text, /°$/)
      if (degrees == null || (min >= 0 && degrees < 0)) return null
      const span = max - min
      return ((((degrees - min) % span) + span) % span) + min
    },
    invalid: 'Not a valid angle',
    onCommit,
  })
  return <CommitField label={label} hint="e.g. 90°" field={field} />
}

/** A fraction shown and typed as a percentage, `0–100 %` unless `max` (in percent) says otherwise. */
export function PercentField({
  label,
  value,
  onCommit,
  max = 100,
}: {
  label: string
  value: number
  onCommit: (fraction: number) => boolean | void
  max?: number
}) {
  const field = useCommitField({
    format: () => `${Math.round(value * 100)} %`,
    parse: (text) => {
      const percent = readNumber(text, /%$/)
      if (percent == null || percent < 0 || percent > max) return null
      return percent / 100
    },
    invalid: 'Not a valid percentage',
    onCommit,
  })
  return <CommitField label={label} hint="e.g. 50 %" field={field} />
}
