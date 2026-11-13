import { useTranslate } from '../../i18n'
import type { PanelDef } from './registry'

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
  return (
    <section className={className} aria-label={tr(panel.title)}>
      {floating && <h2 className="float-title">{tr(panel.title)}</h2>}
      <panel.Component />
    </section>
  )
}
