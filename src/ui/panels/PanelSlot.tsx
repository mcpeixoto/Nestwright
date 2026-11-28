import { useTranslate } from '../../i18n'
import { setPanelOpen, type PanelDef } from './registry'

export function PanelSlot({ panel, stacked = false }: { panel: PanelDef; stacked?: boolean }) {
  const tr = useTranslate()
  const floating = panel.placement === 'floating'
  const className = floating
    ? stacked
      ? 'floating-panel stacked'
      : 'floating-panel'
    : panel.placement === 'bottom'
      ? 'panel-slot bottom'
      : 'panel-slot'
  const title = tr(panel.title)
  const close = (
    <button
      type="button"
      className="icon-btn"
      aria-label={tr('Close {name}', { name: title })}
      onClick={() => setPanelOpen(panel.id, false)}
    >
      ×
    </button>
  )
  return (
    <section className={className} aria-label={title}>
      <header className="panel-head">
        <h2 className={floating ? 'float-title' : undefined}>{title}</h2>
        {close}
      </header>
      <panel.Component />
    </section>
  )
}
