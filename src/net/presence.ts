import type { Vec2 } from '../model/types'
import type { CameraPose } from './protocol'

export interface PresencePeer {
  id: string
  name: string
  colour: string
  levelId: string
  cursor: Vec2 | null
  camera?: CameraPose
  selection: string[]
}

let selfId = ''
let peers: PresencePeer[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function setSelfId(id: string): void {
  selfId = id
}

export function getSelfId(): string {
  return selfId
}

export function getPresencePeers(): PresencePeer[] {
  return peers
}

export function upsertPresence(peer: PresencePeer): void {
  const next = peers.slice()
  const index = next.findIndex((item) => item.id === peer.id)
  if (index >= 0) next[index] = peer
  else next.push(peer)
  peers = next
  emit()
}

export function removePresence(id: string): void {
  if (!peers.some((peer) => peer.id === id)) return
  peers = peers.filter((peer) => peer.id !== id)
  emit()
}

export function clearPresence(): void {
  selfId = ''
  if (peers.length === 0) return
  peers = []
  emit()
}

export function subscribePresence(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
