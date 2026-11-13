import { matchingInspectorSections, type InspectorMatchState } from './inspector/registry'
import { useStore } from '../store'
import './inspector/sections'

export function Inspector() {
  const selection = useStore((s) => s.selection)
  const project = useStore((s) => s.project)
  const activeLevelId = useStore((s) => s.activeLevelId)
  const tool = useStore((s) => s.tool)
  const openingSubtype = useStore((s) => s.openingSubtype)
  const state: InspectorMatchState = { project, activeLevelId, tool, openingSubtype }
  const sections = matchingInspectorSections(selection, state)

  return (
    <aside className="inspector">
      {sections.map((section) => (
        <section.Component key={section.id} selection={selection} state={state} />
      ))}
    </aside>
  )
}
