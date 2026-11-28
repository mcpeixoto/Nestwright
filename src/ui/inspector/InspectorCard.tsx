import { useSyncExternalStore, type ReactNode } from 'react'
import { isCollapsed, subscribeCollapsed, toggleCollapsed } from './collapsed'

/** A collapsible inspector section; the collapsed state survives reloads. */
export function InspectorCard({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => isCollapsed(id),
    () => false,
  )
  return (
    <section className="props card" data-card={id}>
      <h2>
        <button type="button" aria-expanded={!collapsed} onClick={() => toggleCollapsed(id)}>
          {heading}
        </button>
      </h2>
      {collapsed ? null : <div className="card-content">{children}</div>}
    </section>
  )
}
