import { useState } from 'react'
import { getMaterialDef, MATERIAL_CATEGORIES, MATERIALS, swatchColor } from '../materials/library'
import type { MaterialRef } from '../model/types'

export function MaterialPicker({ value, onChange }: { value: MaterialRef; onChange: (next: MaterialRef) => void }) {
  const [open, setOpen] = useState(false)
  const def = getMaterialDef(value.id)
  return (
    <div className="mat-pick">
      <button type="button" className="swatch-btn" onClick={() => setOpen((v) => !v)}>
        <span className="swatch" style={{ background: swatchColor(value.id) }} />
        <span>{def?.name ?? value.id}</span>
      </button>
      {open && (
        <div className="swatch-pop">
          {MATERIAL_CATEGORIES.map((category) => (
            <div key={category}>
              <div className="swatch-cat">{category}</div>
              <div className="swatch-grid">
                {MATERIALS.filter((material) => material.category === category).map((material) => (
                  <button
                    type="button"
                    key={material.id}
                    title={material.name}
                    className={material.id === value.id ? 'swatch on' : 'swatch'}
                    style={{ background: material.color }}
                    onClick={() => {
                      onChange({ ...value, id: material.id })
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
