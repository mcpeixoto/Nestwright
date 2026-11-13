import type { PanelDef } from './registry'

export function PanelSlot({ panel }: { panel: PanelDef }) {
  const floating = panel.placement === 'floating'
  return (
    <section className={floating ? 'floating-panel' : panel.placement === 'bottom' ? 'panel-slot bottom' : 'panel-slot'} aria-label={panel.title}>
      <panel.Component />
    </section>
  )
}
