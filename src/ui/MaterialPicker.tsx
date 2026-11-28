import { useState } from 'react'
import { materialCategoryName } from '../i18n/catalog'
import { useTranslate } from '../i18n'
import { useSettings } from '../settings'
import { getMaterialDef, MATERIAL_CATEGORIES, MATERIALS, swatchColor } from '../materials/library'
import type { MaterialRef } from '../model/types'
import { T } from '../i18n/T'
import { Tooltip } from './Tooltip'

function channel(hex: string, index: number): number {
  const body = hex.replace('#', '')
  const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body
  const value = Number.parseInt(full.slice(index * 2, index * 2 + 2), 16)
  return Number.isFinite(value) ? value / 255 : 0.7
}

function toHex(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0')
}

function lightnessOf(hex: string): number {
  const r = channel(hex, 0)
  const g = channel(hex, 1)
  const b = channel(hex, 2)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max + min) / 2
}

function withLightness(hex: string, lightness: number): string {
  const r = channel(hex, 0)
  const g = channel(hex, 1)
  const b = channel(hex, 2)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const c = (1 - Math.abs(2 * lightness - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - c / 2
  const tone: [number, number, number] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return `#${toHex(tone[0] + m)}${toHex(tone[1] + m)}${toHex(tone[2] + m)}`
}

function cssHex(hex: string): string {
  const body = hex.replace('#', '')
  if (body.length === 3) return `#${body.split('').map((c) => c + c).join('')}`
  if (body.length >= 6) return `#${body.slice(0, 6)}`
  return '#cccccc'
}

export function MaterialPicker({ value, onChange }: { value: MaterialRef; onChange: (next: MaterialRef) => void }) {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const [open, setOpen] = useState(false)
  const def = getMaterialDef(value.id)
  const tint = value.tint || def?.color || '#cccccc'
  const brightness = Math.round(lightnessOf(cssHex(tint)) * 100)
  const scale = value.scale && value.scale > 0 ? value.scale : 1
  return (
    <div className="mat-pick">
      <button type="button" className="swatch-btn" onClick={() => setOpen((v) => !v)}>
        <span className="swatch" style={{ background: value.tint || swatchColor(value.id) }} />
        <span>{def ? tr(def.name) : value.id}</span>
      </button>
      <label className="field">
        <T k="Tint" />
        <input
          type="color"
          aria-label={tr('Tint colour')}
          value={cssHex(tint)}
          onChange={(event) => onChange({ ...value, tint: event.target.value })}
        />
      </label>
      <label className="field">
        <T k="Brightness" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label={tr('Tint brightness')}
          value={brightness}
          onChange={(event) => onChange({ ...value, tint: withLightness(cssHex(tint), Number(event.target.value) / 100) })}
        />
      </label>
      <label className="field">
        <T k="Scale" />
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          aria-label={tr('Material scale')}
          value={scale}
          onChange={(event) => onChange({ ...value, scale: Number(event.target.value) })}
        />
      </label>
      {open && (
        <div className="swatch-pop">
          {MATERIAL_CATEGORIES.map((category) => (
            <div key={category}>
              <div className="swatch-cat">{materialCategoryName(language, category)}</div>
              <div className="swatch-grid">
                {MATERIALS.filter((material) => material.category === category).map((material) => (
                  <Tooltip key={material.id} label={tr(material.name)}>
                  <button
                    type="button"
                    aria-label={tr(material.name)}
                    className={material.id === value.id ? 'swatch on' : 'swatch'}
                    style={{ background: material.color }}
                    onClick={() => {
                      onChange({ ...value, id: material.id })
                      setOpen(false)
                    }}
                  />
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
