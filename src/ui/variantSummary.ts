import { fill, translate } from '../i18n'
import { roomDisplayName } from '../i18n/rooms'
import type { VariantDiff } from '../model/variants'

function signed(value: string, positive: boolean): string {
  return `${positive ? '+' : ''}${value}`
}

/** The translated counterpart of `summariseDiff` from src/model/variants. */
export function describeDiff(language: string, diff: VariantDiff): string {
  const rooms = (names: string[]) =>
    names.length > 0 ? names.map((name) => roomDisplayName(language, name)).join(', ') : translate(language, 'none')
  return fill(language, 'Rooms added: {added}. Removed: {removed}. Area {area} m². {items} items. Cost {cost}.', {
    added: rooms(diff.roomsAdded),
    removed: rooms(diff.roomsRemoved),
    area: signed(diff.areaChange.toFixed(1), diff.areaChange >= 0),
    items: signed(String(diff.itemChange), diff.itemChange >= 0),
    cost: signed(String(Math.round(diff.costChange)), diff.costChange >= 0),
  })
}
