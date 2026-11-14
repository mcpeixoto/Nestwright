import { useEffect, useRef, useState } from 'react'
import { exportHouseGlb } from '../../io/export/glb'
import { exportPlanPng, exportViewImage } from '../../io/export/images'
import { registerTopBarAction } from './registry'
import { PlanPdfDialog } from './PlanPdfDialog'
import { T } from '../../i18n/T'

function ExportMenu() {
  const [open, setOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <T k="Export" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => run(() => exportViewImage(1920, 1080))}>
            <T k="Image" />
          </button>
          <button type="button" role="menuitem" onClick={() => {
              setOpen(false)
              setPdfOpen(true)
            }}>
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
      {pdfOpen && <PlanPdfDialog onClose={() => setPdfOpen(false)} />}
    </div>
  )
}

registerTopBarAction({ id: 'export', label: 'Export', order: 45, Component: ExportMenu })
