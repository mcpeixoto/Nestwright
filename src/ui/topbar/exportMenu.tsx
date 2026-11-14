import { useEffect, useRef, useState } from 'react'
import { exportHouseGlb } from '../../io/export/glb'
import { exportPlanPdf, exportPlanPng, exportViewImage } from '../../io/export/images'
import { useTranslate } from '../../i18n'
import { T } from '../../i18n/T'
import { Tooltip } from '../Tooltip'
import { exportIcon } from './icons'
import { registerTopBarAction } from './registry'

function ExportMenu() {
  const tr = useTranslate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const name = tr('Export')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  const run = (fn: () => Promise<void>) => {
    setOpen(false)
    void fn()
  }

  return (
    <div className="menu" ref={ref}>
      <Tooltip label={name}>
        <button type="button" className="tb-btn" aria-label={name} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="tb-glyph" dangerouslySetInnerHTML={{ __html: exportIcon }} />
          <span className="tb-label">{name}</span>
        </button>
      </Tooltip>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => run(() => exportViewImage(1920, 1080))}>
            <T k="Image" />
          </button>
          <button type="button" role="menuitem" onClick={() => run(() => exportPlanPdf())}>
            <T k="Floor plan PDF" />
          </button>
          <button type="button" role="menuitem" onClick={() => run(() => exportPlanPng())}>
            <T k="Plan PNG" />
          </button>
          <button type="button" role="menuitem" onClick={() => run(() => exportHouseGlb())}>
            <T k="GLB" />
          </button>
        </div>
      )}
    </div>
  )
}

registerTopBarAction({ id: 'export', label: 'Export', order: 45, Component: ExportMenu })
