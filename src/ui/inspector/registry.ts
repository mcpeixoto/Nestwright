import type { ComponentType } from 'react'
import type { OpeningType, Project } from '../../model/types'

export interface InspectorMatchState {
  project: Project
  activeLevelId: string
  tool: string
  openingSubtype: OpeningType
}

export interface InspectorSectionProps {
  selection: readonly string[]
  state: InspectorMatchState
}

export interface InspectorSection {
  id: string
  order: number
  title: string
  match: (selection: readonly string[], state: InspectorMatchState) => boolean
  Component: ComponentType<InspectorSectionProps>
}

const sections = new Map<string, InspectorSection>()

export function registerInspectorSection(section: InspectorSection): void {
  sections.set(section.id, section)
}

export function listInspectorSections(): InspectorSection[] {
  return [...sections.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export function matchingInspectorSections(
  selection: readonly string[],
  state: InspectorMatchState,
): InspectorSection[] {
  return listInspectorSections().filter((section) => section.match(selection, state))
}
