import type { Patch } from 'immer'
import type { Project, Vec2 } from '../model/types'

export const PROTOCOL_VERSION = 1
export const COOP_PORT = 47321

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Four uppercase letters. `random` is injectable so this stays free of I/O. */
export function randomCode(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < 4; i++) {
    const index = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(random() * LETTERS.length)))
    out += LETTERS[index] ?? 'A'
  }
  return out
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Peer {
  id: string
  name: string
  colour: string
}

export interface CameraPose {
  pos: Vec3
  target: Vec3
}

export interface HelloMessage {
  type: 'hello'
  id: string
  name: string
  colour: string
  code: string
  version: number
}

export interface WelcomeMessage {
  type: 'welcome'
  project: Project
  peers: Peer[]
  selfId: string
  seq: number
}

export interface PatchesMessage {
  type: 'patches'
  from: string
  seq: number
  patches: Patch[]
}

export interface PresenceMessage {
  type: 'presence'
  from: string
  name: string
  colour: string
  levelId: string
  cursor: Vec2 | null
  camera?: CameraPose
  selection: string[]
}

export interface ChatMessage {
  type: 'chat'
  from: string
  text: string
}

export interface ByeMessage {
  type: 'bye'
  from?: string
  text?: string
}

export interface SyncMessage {
  type: 'sync'
  from?: string
  project?: Project
  seq?: number
}

export interface RosterMessage {
  type: 'roster'
  peers: Peer[]
}

export type NetMessage =
  | HelloMessage
  | WelcomeMessage
  | PatchesMessage
  | PresenceMessage
  | ChatMessage
  | ByeMessage
  | SyncMessage
  | RosterMessage

export function encodeMessage(message: NetMessage): string {
  return JSON.stringify(message)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  return value.slice(0, max)
}

function asVec2(value: unknown): Vec2 | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.x !== 'number' || typeof record.y !== 'number') return null
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return null
  return { x: record.x, y: record.y }
}

function asVec3(value: unknown): Vec3 | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.x !== 'number' || typeof record.y !== 'number' || typeof record.z !== 'number') return null
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y) || !Number.isFinite(record.z)) return null
  return { x: record.x, y: record.y, z: record.z }
}

function asPeers(value: unknown): Peer[] | null {
  if (!Array.isArray(value)) return null
  const out: Peer[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) return null
    const id = asString(record.id, 80)
    const name = asString(record.name, 40)
    const colour = asString(record.colour, 20)
    if (!id || name == null || !colour) return null
    out.push({ id, name, colour })
  }
  return out
}

function asPatches(value: unknown): Patch[] | null {
  if (!Array.isArray(value)) return null
  const out: Patch[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) return null
    if (record.op !== 'add' && record.op !== 'remove' && record.op !== 'replace') return null
    if (!Array.isArray(record.path)) return null
    out.push(record as unknown as Patch)
  }
  return out
}

function asProject(value: unknown): Project | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.levels)) return null
  return record as unknown as Project
}

function asSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') out.push(entry.slice(0, 80))
    if (out.length >= 100) break
  }
  return out
}

export function parseMessage(raw: string): NetMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const record = asRecord(data)
  if (!record || typeof record.type !== 'string') return null
  switch (record.type) {
    case 'hello': {
      const id = asString(record.id, 80)
      const name = asString(record.name, 40)
      const colour = asString(record.colour, 20)
      const code = asString(record.code, 8)
      if (!id || !name || !colour || !code || typeof record.version !== 'number') return null
      return { type: 'hello', id, name, colour, code, version: record.version }
    }
    case 'welcome': {
      const project = asProject(record.project)
      const peers = asPeers(record.peers)
      const selfId = asString(record.selfId, 80)
      if (!project || !peers || !selfId || typeof record.seq !== 'number') return null
      return { type: 'welcome', project, peers, selfId, seq: record.seq }
    }
    case 'patches': {
      const from = asString(record.from, 80)
      const patches = asPatches(record.patches)
      if (!from || !patches || typeof record.seq !== 'number') return null
      return { type: 'patches', from, seq: record.seq, patches }
    }
    case 'presence': {
      const from = asString(record.from, 80)
      const name = asString(record.name, 40)
      const colour = asString(record.colour, 20)
      const levelId = asString(record.levelId, 80)
      if (!from || name == null || !colour || levelId == null) return null
      let cursor: Vec2 | null = null
      if (record.cursor != null) {
        cursor = asVec2(record.cursor)
        if (!cursor) return null
      }
      let camera: CameraPose | undefined
      if (record.camera != null) {
        const cam = asRecord(record.camera)
        const pos = cam ? asVec3(cam.pos) : null
        const target = cam ? asVec3(cam.target) : null
        if (!pos || !target) return null
        camera = { pos, target }
      }
      return {
        type: 'presence',
        from,
        name,
        colour,
        levelId,
        cursor,
        camera,
        selection: asSelection(record.selection),
      }
    }
    case 'chat': {
      const from = asString(record.from, 80)
      const text = asString(record.text, 500)
      if (!from || text == null) return null
      return { type: 'chat', from, text }
    }
    case 'bye': {
      const from = asString(record.from, 80) ?? undefined
      const text = asString(record.text, 200) ?? undefined
      return { type: 'bye', from, text }
    }
    case 'sync': {
      const from = asString(record.from, 80) ?? undefined
      if (record.project == null) return { type: 'sync', from }
      const project = asProject(record.project)
      if (!project) return null
      const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : 0
      return { type: 'sync', from, project, seq }
    }
    case 'roster': {
      const peers = asPeers(record.peers)
      if (!peers) return null
      return { type: 'roster', peers }
    }
    default:
      return null
  }
}

/** `192.168.1.20`, `192.168.1.20:47321`, or `ws://192.168.1.20:47321`. */
export function websocketUrl(address: string, fallbackPort = COOP_PORT): string | null {
  const text = address.trim().replace(/^wss?:\/\//i, '')
  if (!text || /[\s/]/.test(text)) return null
  const colon = text.lastIndexOf(':')
  if (colon > 0 && /^\d+$/.test(text.slice(colon + 1))) {
    const host = text.slice(0, colon)
    const port = Number(text.slice(colon + 1))
    if (!host || port < 1 || port > 65535) return null
    return `ws://${host}:${port}`
  }
  if (!/^[\w.-]+$/.test(text)) return null
  return `ws://${text}:${fallbackPort}`
}
