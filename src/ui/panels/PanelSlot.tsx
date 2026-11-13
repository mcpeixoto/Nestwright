import type { PanelDef } from './registry'

export function PanelSlot({ panel, stacked = false }: { panel: PanelDef; stacked?: boolean }) {
  const floating = panel.placement === 'floating'
  const className = floating
    ? stacked
      ? 'floating-panel stacked'
      : 'floating-panel'
    : panel.placement === 'bottom'
      ? 'panel-slot bottom'
      : 'panel-slot'
  return (
    <section className={className} aria-label={panel.title}>
      {floating && <h2 className="float-title">{panel.title}</h2>}
      <panel.Component />
    </section>
  )
}
