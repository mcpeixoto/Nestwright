import { useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { useSettings } from '../../settings'
import { useStore } from '../../store'
import { exportPlanPdf } from '../../io/export/images'
import { layoutPlanSheets, sheetLevels, type PaperSize, type PlanScale } from '../../io/export/planSheet'

export function PlanPdfDialog({ onClose }: { onClose: () => void }) {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const [scale, setScale] = useState<PlanScale>(100)
  const [paper, setPaper] = useState<PaperSize>('A3')
  const [picked, setPicked] = useState<string[]>(() => sheetLevels(project).map((level) => level.id))
  const [busy, setBusy] = useState(false)

  const sheets = useMemo(
    () => (picked.length > 0 ? layoutPlanSheets(project, { scale, paper, orientation: 'auto', levelIds: picked, language }) : []),
    [project, scale, paper, picked, language],
  )
  const tooBig = sheets.filter((sheet) => !sheet.fits)

  const toggle = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : project.levels.filter((l) => l.id === id || list.includes(l.id)).map((l) => l.id)))

  const save = async () => {
    if (picked.length === 0 || tooBig.length > 0) return
    setBusy(true)
    try {
      const ok = await exportPlanPdf({ scale, paper, orientation: 'auto', levelIds: picked, language })
      if (ok) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal className="plan-pdf-dialog" label={tr('Plan PDF')} onClose={onClose}>
      <h2>
        <T k="Plan PDF" />
      </h2>
      <div className="plan-pdf-grid">
        <label className="field">
          <T k="Scale" />
          <select value={scale} onChange={(event) => setScale(event.target.value === '50' ? 50 : 100)}>
            <option value="50">1:50</option>
            <option value="100">1:100</option>
          </select>
        </label>
        <label className="field">
          <T k="Paper" />
          <select value={paper} onChange={(event) => setPaper(event.target.value === 'A4' ? 'A4' : 'A3')}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </label>
      </div>
      <fieldset className="plan-pdf-levels">
        <legend>
          <T k="Levels to print" />
        </legend>
        {project.levels.map((level) => (
          <label key={level.id} className="check">
            <input type="checkbox" checked={picked.includes(level.id)} onChange={() => toggle(level.id)} />
            {level.name}
          </label>
        ))}
      </fieldset>
      {picked.length === 0 && (
        <p className="plan-pdf-warn" role="alert">
          <T k="Pick at least one level" />
        </p>
      )}
      {tooBig.map((sheet) => (
        <p key={sheet.levelId} className="plan-pdf-warn" role="alert">
          {tr('{level} does not fit on {paper} at 1:{scale}. Try 1:100 or A3.', { level: sheet.levelName, paper, scale })}
        </p>
      ))}
      <div className="together-row plan-pdf-actions">
        <button type="button" onClick={onClose}>
          <T k="Cancel" />
        </button>
        <button type="button" className="on" disabled={busy || picked.length === 0 || tooBig.length > 0} onClick={() => void save()}>
          <T k="Save PDF" />
        </button>
      </div>
    </Modal>
  )
}
