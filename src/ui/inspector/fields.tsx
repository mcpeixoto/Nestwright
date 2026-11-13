import { useState } from 'react'
import { useTranslate } from '../../i18n'
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
