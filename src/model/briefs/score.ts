import { projectAreas, roomNetArea } from '../areas'
import { estimateBudget } from '../budget'
import { clearanceIssues } from '../clearance'
import { pointInPolygon, polygonCentroid } from '../geometry'
import { detectRooms } from '../rooms'
import { computeStairSteps, resolvedRise } from '../stairs'
import type { Level, Opening, Project, Room, RoomType, Stair, Vec2 } from '../types'
import { sampleFrame, wallFrame } from '../walls'
import type { BriefCheck, BriefResult, HouseBrief, Localized } from './types'

/** Passages a person can walk through. An arch has no leaf but it still joins rooms. */
const PASSAGES = new Set(['door', 'double-door', 'sliding-door', 'garage-door', 'arch'])
/** Leaves a wheelchair has to pass. Width is checked only when the brief asks for access. */
const DOORS = new Set(['door', 'double-door', 'sliding-door', 'garage-door'])
const WINDOWS = new Set(['window', 'fixed-window', 'tall-window', 'round-window', 'corner-window'])
const DAYLIGHT_TYPES = new Set<RoomType>(['bedroom', 'living', 'kitchen'])
const DOOR_CLEAR = 0.85
const OUTSIDE = 'outside'

const ROOM_NOUN: Record<RoomType, { en: string; pt: string; enPlural: string; ptPlural: string }> = {
  living: { en: 'Living room', pt: 'Sala', enPlural: 'living rooms', ptPlural: 'salas' },
  kitchen: { en: 'Kitchen', pt: 'Cozinha', enPlural: 'kitchens', ptPlural: 'cozinhas' },
  dining: { en: 'Dining room', pt: 'Sala de jantar', enPlural: 'dining rooms', ptPlural: 'salas de jantar' },
  bedroom: { en: 'Bedroom', pt: 'Quarto', enPlural: 'bedrooms', ptPlural: 'quartos' },
  bathroom: { en: 'Bathroom', pt: 'Casa de banho', enPlural: 'bathrooms', ptPlural: 'casas de banho' },
  wc: { en: 'WC', pt: 'Lavabo', enPlural: 'WCs', ptPlural: 'lavabos' },
  office: { en: 'Office', pt: 'Escritório', enPlural: 'offices', ptPlural: 'escritórios' },
  hall: { en: 'Hall', pt: 'Vestíbulo', enPlural: 'halls', ptPlural: 'vestíbulos' },
  storage: { en: 'Storage', pt: 'Arrumos', enPlural: 'storage rooms', ptPlural: 'arrumos' },
  laundry: { en: 'Laundry', pt: 'Lavandaria', enPlural: 'laundries', ptPlural: 'lavandarias' },
  garage: { en: 'Garage', pt: 'Garagem', enPlural: 'garages', ptPlural: 'garagens' },
  balcony: { en: 'Balcony', pt: 'Varanda', enPlural: 'balconies', ptPlural: 'varandas' },
  terrace: { en: 'Terrace', pt: 'Terraço', enPlural: 'terraces', ptPlural: 'terraços' },
  kids: { en: "Children's room", pt: 'Quarto de crianças', enPlural: "children's rooms", ptPlural: 'quartos de crianças' },
  other: { en: 'Studio', pt: 'Ateliê', enPlural: 'studios', ptPlural: 'ateliês' },
}

interface Placed {
  level: Level
  room: Room
  net: number
}

function formatNumber(value: number, digits: number, lang: 'en' | 'pt'): string {
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits).replace(/\.?0+$/, '')
  return lang === 'pt' ? text.replace('.', ',') : text
}

function formatArea(m2: number, lang: 'en' | 'pt'): string {
  return `${formatNumber(m2, 1, lang)} m²`
}

function formatMetres(metres: number, lang: 'en' | 'pt'): string {
  return `${formatNumber(metres, 2, lang)} m`
}

function formatEur(amount: number, lang: 'en' | 'pt'): string {
  const rounded = Math.round(amount)
  const body = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : ' ')
  const sign = rounded < 0 ? '-' : ''
  return lang === 'en' ? `${sign}€${body}` : `${sign}${body} €`
}

function both(en: string, pt: string): Localized {
  return { en, pt }
}

function roomCheckId(rooms: HouseBrief['rooms'], index: number): string {
  const type = rooms[index]?.type
  if (!type) return `room:${index}`
  const again = rooms.some((room, other) => other !== index && room.type === type)
  return again ? `room:${type}:${index}` : `room:${type}`
}

function roomLabel(type: RoomType, count: number, minArea: number | undefined): Localized {
  const noun = ROOM_NOUN[type]
  const areaEn = minArea == null ? '' : formatArea(minArea, 'en')
  const areaPt = minArea == null ? '' : formatArea(minArea, 'pt')
  if (count === 1 && minArea != null) {
    return both(`${noun.en} of at least ${areaEn}`, `${noun.pt} com pelo menos ${areaPt}`)
  }
  if (count === 1) return both(noun.en, noun.pt)
  if (minArea != null) {
    return both(
      `${count} ${noun.enPlural}, at least ${areaEn} each`,
      `${count} ${noun.ptPlural}, pelo menos ${areaPt} cada`,
    )
  }
  return both(`${count} ${noun.enPlural}`, `${count} ${noun.ptPlural}`)
}

function collect(project: Project): Placed[] {
  const placed: Placed[] = []
  for (const level of project.levels) {
    for (const room of detectRooms(level)) {
      placed.push({ level, room, net: roomNetArea(level, room) })
    }
  }
  return placed
}

function qualifying(placed: readonly Placed[], type: RoomType, minArea: number | undefined): Placed[] {
  return placed.filter((place) => {
    if (place.room.type !== type) return false
    if (minArea != null && place.net + 1e-6 < minArea) return false
    return true
  })
}

function roomCheck(brief: HouseBrief, index: number, placed: readonly Placed[]): BriefCheck {
  const req = brief.rooms[index]
  const type = req?.type ?? 'other'
  const count = req?.count ?? 0
  const minArea = req?.minArea
  const have = qualifying(placed, type, minArea)
  const ofType = placed.filter((place) => place.room.type === type)
  const ok = have.length >= count
  const noun = ROOM_NOUN[type]
  let detail: Localized
  if (ok) {
    detail = both(
      `${have.length} ${have.length === 1 ? noun.en.toLowerCase() : noun.enPlural} in the house.`,
      `${have.length} ${have.length === 1 ? noun.pt.toLowerCase() : noun.ptPlural} na casa.`,
    )
  } else if (ofType.length < count) {
    detail = both(
      `Need ${count}; found ${ofType.length}.`,
      `São precisos ${count}; há ${ofType.length}.`,
    )
  } else {
    const largest = Math.max(...ofType.map((place) => place.net))
    detail = both(
      `Found ${ofType.length}, but only ${have.length} reach ${formatArea(minArea ?? 0, 'en')}. Largest is ${formatArea(largest, 'en')}.`,
      `Há ${ofType.length}, mas só ${have.length} chegam a ${formatArea(minArea ?? 0, 'pt')}. A maior tem ${formatArea(largest, 'pt')}.`,
    )
  }
  return {
    id: roomCheckId(brief.rooms, index),
    ok,
    label: roomLabel(type, count, minArea),
    detail,
  }
}

function budgetCheck(project: Project, cap: number): BriefCheck {
  const total = estimateBudget(project).total
  const ok = total <= cap + 1e-6
  return {
    id: 'budget',
    ok,
    label: both(`Within the ${formatEur(cap, 'en')} budget`, `Dentro do orçamento de ${formatEur(cap, 'pt')}`),
    detail: both(`The estimate is ${formatEur(total, 'en')}.`, `A estimativa é ${formatEur(total, 'pt')}.`),
  }
}

function areaCheck(project: Project, brief: HouseBrief): BriefCheck {
  const net = projectAreas(project).net
  const { minFloorArea: min, maxFloorArea: max } = brief
  const underMax = max == null || net <= max + 1e-6
  const overMin = min == null || net + 1e-6 >= min
  let label: Localized
  if (min != null && max != null) {
    label = both(
      `Net floor area between ${formatArea(min, 'en')} and ${formatArea(max, 'en')}`,
      `Área útil entre ${formatArea(min, 'pt')} e ${formatArea(max, 'pt')}`,
    )
  } else if (max != null) {
    label = both(`Net floor area up to ${formatArea(max, 'en')}`, `Área útil até ${formatArea(max, 'pt')}`)
  } else {
    label = both(
      `Net floor area of at least ${formatArea(min ?? 0, 'en')}`,
      `Área útil de pelo menos ${formatArea(min ?? 0, 'pt')}`,
    )
  }
  return {
    id: 'floor-area',
    ok: underMax && overMin,
    label,
    detail: both(`Net floor area is ${formatArea(net, 'en')}.`, `A área útil é ${formatArea(net, 'pt')}.`),
  }
}

function levelsCheck(project: Project, levels: { min?: number; max?: number }): BriefCheck {
  const count = project.levels.length
  const { min, max } = levels
  const ok = (min == null || count >= min) && (max == null || count <= max)
  let label: Localized
  if (min != null && max != null && min === max) {
    label = both(min === 1 ? 'A single level' : `${min} levels`, min === 1 ? 'Um só piso' : `${min} pisos`)
  } else if (min != null && max != null) {
    label = both(`Between ${min} and ${max} levels`, `Entre ${min} e ${max} pisos`)
  } else if (max != null) {
    label = both(max === 1 ? 'A single level' : `At most ${max} levels`, max === 1 ? 'Um só piso' : `No máximo ${max} pisos`)
  } else {
    label = both(
      min === 1 ? 'At least 1 level' : `At least ${min ?? 0} levels`,
      min === 1 ? 'Pelo menos 1 piso' : `Pelo menos ${min ?? 0} pisos`,
    )
  }
  const enCount = count === 1 ? '1 level' : `${count} levels`
  const ptCount = count === 1 ? '1 piso' : `${count} pisos`
  return {
    id: 'levels',
    ok,
    label,
    detail: both(`The house has ${enCount}.`, `A casa tem ${ptCount}.`),
  }
}

function insidePlot(point: Vec2, plot: HouseBrief['plot']): boolean {
  return Math.abs(point.x) <= plot.width / 2 + 1e-6 && Math.abs(point.y) <= plot.depth / 2 + 1e-6
}

function plotCheck(project: Project, plot: HouseBrief['plot']): BriefCheck {
  let outside = false
  for (const level of project.levels) {
    for (const wall of level.walls) {
      if (!insidePlot(wall.a, plot) || !insidePlot(wall.b, plot)) outside = true
    }
  }
  return {
    id: 'plot',
    ok: !outside,
    label: both('Walls inside the plot', 'Paredes dentro do lote'),
    detail: outside
      ? both('A wall ends outside the plot.', 'Há uma parede que acaba fora do lote.')
      : both('Every wall ends inside the plot.', 'Todas as paredes acabam dentro do lote.'),
  }
}

function lowestLevelIds(project: Project): Set<string> {
  let min = Infinity
  for (const level of project.levels) min = Math.min(min, level.elevation)
  const ids = new Set<string>()
  for (const level of project.levels) {
    if (level.elevation <= min + 1e-6) ids.add(level.id)
  }
  return ids
}

function narrowestDoor(project: Project): number | null {
  let width: number | null = null
  for (const level of project.levels) {
    for (const opening of level.openings) {
      if (!DOORS.has(opening.type)) continue
      if (opening.width + 1e-9 >= DOOR_CLEAR) continue
      if (width == null || opening.width < width) width = opening.width
    }
  }
  return width
}

function accessibleCheck(project: Project, brief: HouseBrief, placed: readonly Placed[]): BriefCheck {
  const lowest = lowestLevelIds(project)
  const upstairs: RoomType[] = []
  for (const req of brief.rooms) {
    const onGround = qualifying(placed, req.type, req.minArea).filter((place) => lowest.has(place.level.id))
    if (onGround.length < req.count) upstairs.push(req.type)
  }
  const narrow = narrowestDoor(project)
  const ok = upstairs.length === 0 && narrow == null
  const partsEn: string[] = []
  const partsPt: string[] = []
  if (narrow != null) {
    partsEn.push(`A door is ${formatMetres(narrow, 'en')} wide; every door needs at least ${formatMetres(DOOR_CLEAR, 'en')}.`)
    partsPt.push(`Há uma porta com ${formatMetres(narrow, 'pt')}; todas precisam de pelo menos ${formatMetres(DOOR_CLEAR, 'pt')}.`)
  }
  if (upstairs.length > 0) {
    const names = upstairs.map((type) => ROOM_NOUN[type].en.toLowerCase()).join(', ')
    const nomes = upstairs.map((type) => ROOM_NOUN[type].pt.toLowerCase()).join(', ')
    partsEn.push(`Not all required rooms are on the lowest level: ${names}.`)
    partsPt.push(`Nem todas as divisões exigidas estão no piso mais baixo: ${nomes}.`)
  }
  if (ok) {
    partsEn.push('Every required room is on the lowest level and every door is wide enough.')
    partsPt.push('Todas as divisões exigidas estão no piso mais baixo e todas as portas são largas o suficiente.')
  }
  return {
    id: 'accessible',
    ok,
    label: both('Step-free rooms and doors at least 0.85 m wide', 'Divisões sem degraus e portas com pelo menos 0,85 m'),
    detail: both(partsEn.join(' '), partsPt.join(' ')),
  }
}

/** Rooms on either side of an opening, sampled at the opening rather than the whole wall. */
function beside(level: Level, rooms: readonly Room[], opening: Pick<Opening, 'wallId' | 'offset'>): [Room | null, Room | null] {
  const wall = level.walls.find((item) => item.id === opening.wallId)
  if (!wall) return [null, null]
  const frame = wallFrame(wall)
  if (frame.length < 1e-8) return [null, null]
  const sample = sampleFrame(frame, opening.offset)
  const step = Math.max(wall.thickness / 2 + 0.05, 0.15)
  const left = { x: sample.point.x + sample.normal.x * step, y: sample.point.y + sample.normal.y * step }
  const right = { x: sample.point.x - sample.normal.x * step, y: sample.point.y - sample.normal.y * step }
  const at = (point: Vec2) => rooms.find((room) => pointInPolygon(point, room.polygon)) ?? null
  return [at(left), at(right)]
}

function daylightCheck(placed: readonly Placed[]): BriefCheck {
  const byLevel = new Map<string, Placed[]>()
  for (const place of placed) {
    const list = byLevel.get(place.level.id)
    if (list) list.push(place)
    else byLevel.set(place.level.id, [place])
  }
  const short: { name: string; have: number; need: number }[] = []
  for (const group of byLevel.values()) {
    const level = group[0]?.level
    if (!level) continue
    const areas = new Map<string, number>()
    for (const place of group) areas.set(place.room.key, 0)
    for (const opening of level.openings) {
      if (!WINDOWS.has(opening.type)) continue
      const area = Math.max(0, opening.width) * Math.max(0, opening.height)
      if (area <= 0) continue
      const [a, b] = beside(level, group.map((place) => place.room), opening)
      const seen = new Set<string>()
      for (const room of [a, b]) {
        if (!room || seen.has(room.key)) continue
        seen.add(room.key)
        areas.set(room.key, Math.max(areas.get(room.key) ?? 0, area))
      }
    }
    for (const place of group) {
      if (!DAYLIGHT_TYPES.has(place.room.type)) continue
      const have = areas.get(place.room.key) ?? 0
      const need = place.net / 10
      if (have + 1e-6 < need) short.push({ name: place.room.name, have, need })
    }
  }
  short.sort((a, b) => a.name.localeCompare(b.name))
  const ok = short.length === 0
  const detail = ok
    ? both(
        'Each bedroom, living room and kitchen has a large enough window.',
        'Cada quarto, sala e cozinha tem uma janela grande o suficiente.',
      )
    : both(
        short
          .map((item) => `${item.name} has ${formatArea(item.have, 'en')} of window and needs ${formatArea(item.need, 'en')}.`)
          .join(' '),
        short
          .map((item) => `${item.name} tem ${formatArea(item.have, 'pt')} de janela e precisa de ${formatArea(item.need, 'pt')}.`)
          .join(' '),
      )
  return {
    id: 'daylight',
    ok,
    label: both(
      'A window of at least one tenth of the floor in each bedroom, living room and kitchen',
      'Uma janela com pelo menos um décimo do chão em cada quarto, sala e cozinha',
    ),
    detail,
  }
}

function nodeId(level: Level, room: Room): string {
  return `${level.id}\n${room.key}`
}

function link(adj: Map<string, Set<string>>, a: string, b: string) {
  let left = adj.get(a)
  if (!left) {
    left = new Set()
    adj.set(a, left)
  }
  let right = adj.get(b)
  if (!right) {
    right = new Set()
    adj.set(b, right)
  }
  left.add(b)
  right.add(a)
}

function levelAbove(levels: readonly Level[], level: Level, rise: number): Level | null {
  const target = level.elevation + rise
  let best: Level | null = null
  let bestDist = Infinity
  for (const other of levels) {
    if (other.id === level.id || other.elevation <= level.elevation + 1e-3) continue
    const gap = Math.abs(other.elevation - target)
    if (gap < bestDist - 1e-9 || (Math.abs(gap - bestDist) <= 1e-9 && (best == null || other.id < best.id))) {
      best = other
      bestDist = gap
    }
  }
  return best
}

function roomOnHole(rooms: readonly Room[], hole: readonly Vec2[], fallback: Vec2): Room | null {
  const points: Vec2[] = hole.length >= 3 ? [polygonCentroid(hole), ...hole, fallback] : [fallback]
  for (const point of points) {
    const room = rooms.find((item) => pointInPolygon(point, item.polygon))
    if (room) return room
  }
  return null
}

/**
 * Stairs are stored on the level of the first step (`Stair.position`). The flight
 * rises `resolvedRise` to the next floor, and the hole it cuts is the landing upstairs.
 */
function connectStair(adj: Map<string, Set<string>>, levels: readonly Level[], level: Level, rooms: readonly Room[], roomsOn: Map<string, Room[]>, stair: Stair) {
  const bottom = rooms.find((room) => pointInPolygon(stair.position, room.polygon))
  const upper = levelAbove(levels, level, resolvedRise(stair, level.height))
  if (!bottom || !upper) return
  const layout = computeStairSteps(stair, level.height)
  const top = roomOnHole(roomsOn.get(upper.id) ?? [], layout.hole, stair.position)
  if (!top) return
  link(adj, nodeId(level, bottom), nodeId(upper, top))
}

function circulationCheck(project: Project, placed: readonly Placed[]): BriefCheck {
  const adj = new Map<string, Set<string>>()
  adj.set(OUTSIDE, new Set())
  const byNode = new Map<string, Placed>()
  const roomsOn = new Map<string, Room[]>()
  for (const place of placed) {
    const id = nodeId(place.level, place.room)
    byNode.set(id, place)
    if (!adj.has(id)) adj.set(id, new Set())
    const list = roomsOn.get(place.level.id)
    if (list) list.push(place.room)
    else roomsOn.set(place.level.id, [place.room])
  }
  for (const level of project.levels) {
    const rooms = roomsOn.get(level.id) ?? []
    for (const opening of level.openings) {
      if (!PASSAGES.has(opening.type)) continue
      const [a, b] = beside(level, rooms, opening)
      const aId = a ? nodeId(level, a) : null
      const bId = b ? nodeId(level, b) : null
      if (aId && bId && aId !== bId) link(adj, aId, bId)
      else if (aId) link(adj, aId, OUTSIDE)
      else if (bId) link(adj, bId, OUTSIDE)
    }
    for (const stair of level.stairs) connectStair(adj, project.levels, level, rooms, roomsOn, stair)
  }
  const seen = new Set<string>()
  const queue = [OUTSIDE]
  while (queue.length > 0) {
    const id = queue.pop()
    if (id == null || seen.has(id)) continue
    seen.add(id)
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next)
    }
  }
  const stuck = [...byNode.entries()]
    .filter(([id]) => !seen.has(id))
    .map(([, place]) => place)
    .sort((a, b) => a.room.name.localeCompare(b.room.name) || a.room.key.localeCompare(b.room.key))
  const ok = stuck.length === 0
  const names = stuck.map((place) => place.room.name).join(', ')
  return {
    id: 'circulation',
    ok,
    label: both('Every room reachable from outside', 'Todas as divisões com caminho desde o exterior'),
    detail: ok
      ? both('Every room can be reached from outside.', 'Todas as divisões se alcançam a partir do exterior.')
      : both(`No way in from outside: ${names}.`, `Sem caminho desde o exterior: ${names}.`),
  }
}

function clearanceCheck(project: Project): BriefCheck {
  const blocked = project.levels.some((level) => clearanceIssues(level).length > 0)
  return {
    id: 'clearance',
    ok: !blocked,
    label: both('Clear doors and passages', 'Portas e passagens desimpedidas'),
    detail: blocked
      ? both('A door swing or a passage is blocked.', 'Uma porta ou uma passagem está bloqueada.')
      : both('Doors and passages are clear.', 'Portas e passagens estão livres.'),
  }
}

/**
 * 0 if a required room is missing, 1 once every required room is there,
 * 2 once budget, area, levels and the plot also pass, 3 when nothing fails.
 */
function starsFor(checks: readonly BriefCheck[]): 0 | 1 | 2 | 3 {
  if (checks.some((check) => check.id.startsWith('room:') && !check.ok)) return 0
  const gate = new Set(['budget', 'floor-area', 'levels', 'plot'])
  if (checks.some((check) => gate.has(check.id) && !check.ok)) return 1
  if (checks.some((check) => !check.ok)) return 2
  return 3
}

export function scoreBrief(project: Project, brief: HouseBrief): BriefResult {
  const placed = collect(project)
  const checks: BriefCheck[] = brief.rooms.map((_, index) => roomCheck(brief, index, placed))
  if (brief.budget != null) checks.push(budgetCheck(project, brief.budget))
  if (brief.minFloorArea != null || brief.maxFloorArea != null) checks.push(areaCheck(project, brief))
  if (brief.levels && (brief.levels.min != null || brief.levels.max != null)) checks.push(levelsCheck(project, brief.levels))
  checks.push(plotCheck(project, brief.plot))
  if (brief.accessible) checks.push(accessibleCheck(project, brief, placed))
  if (brief.daylight) checks.push(daylightCheck(placed))
  checks.push(circulationCheck(project, placed))
  checks.push(clearanceCheck(project))
  return { checks, stars: starsFor(checks) }
}
