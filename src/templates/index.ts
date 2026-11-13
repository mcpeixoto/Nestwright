import type { Project } from '../model/types'
import { apartmentFloor } from './floor'
import { beachHouse } from './beach'
import { bungalow } from './bungalow'
import { courtyardHouse } from './courtyard'
import { emptyPlot } from './empty'
import { familyHouse } from './family'
import { studioApartment } from './studio'
import { twoBedApartment } from './twoBed'

export interface TemplateInfo {
  id: string
  nameKey: string
  blurbKey: string
  create: () => Project
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'empty', nameKey: 'template.empty.name', blurbKey: 'template.empty.blurb', create: emptyPlot },
  { id: 'studio', nameKey: 'template.studio.name', blurbKey: 'template.studio.blurb', create: studioApartment },
  { id: 'two-bed', nameKey: 'template.twoBed.name', blurbKey: 'template.twoBed.blurb', create: twoBedApartment },
  { id: 'floor', nameKey: 'template.floor.name', blurbKey: 'template.floor.blurb', create: apartmentFloor },
  { id: 'bungalow', nameKey: 'template.bungalow.name', blurbKey: 'template.bungalow.blurb', create: bungalow },
  { id: 'family', nameKey: 'template.family.name', blurbKey: 'template.family.blurb', create: familyHouse },
  { id: 'beach', nameKey: 'template.beach.name', blurbKey: 'template.beach.blurb', create: beachHouse },
  { id: 'courtyard', nameKey: 'template.courtyard.name', blurbKey: 'template.courtyard.blurb', create: courtyardHouse },
]

export function templateById(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((item) => item.id === id)
}

export { apartmentFloor, beachHouse, bungalow, courtyardHouse, emptyPlot, familyHouse, studioApartment, twoBedApartment }
