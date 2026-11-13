import type { Patch } from 'immer'
import type { Project } from '../model/types'
import {
  PROTOCOL_VERSION,
  encodeMessage,
  parseMessage,
  type NetMessage,
  type PatchesMessage,
  type Peer,
  type PresenceMessage,
} from './protocol'

export interface CoopStore {
  getProject(): Project
  applyRemotePatches(patches: Patch[]): void
  subscribeEdits(listener: (patches: Patch[], inverse: Patch[]) => void): () => void
  replaceProject(project: Project): void
}

export interface HostTransport {
  send(peerId: string, raw: string): void
  close(): void
}

export interface ClientTransport {
  send(raw: string): void
  close(): void
}

export interface PresenceBody {
  levelId: string
  cursor: PresenceMessage['cursor']
  camera?: PresenceMessage['camera']
  selection: string[]
}

export interface SessionHooks {
  onPeers?(peers: Peer[]): void
  onJoined?(peer: Peer): void
  onLeft?(peer: Peer): void
  onChat?(peer: Peer, text: string): void
  onPresence?(message: PresenceMessage): void
  onRejected?(text: string): void
  onDisconnected?(): void
  onSynced?(): void
  onWelcome?(peers: Peer[]): void
}

interface PendingEdit {
  patches: Patch[]
  inverse: Patch[]
}

function diffPeers(seen: Set<string>, known: Map<string, Peer>, next: Peer[], hooks: SessionHooks): void {
  const nextIds = new Set(next.map((peer) => peer.id))
  for (const peer of next) {
    if (!seen.has(peer.id)) hooks.onJoined?.(peer)
  }
  for (const id of seen) {
    if (!nextIds.has(id)) {
      const peer = known.get(id)
      if (peer) hooks.onLeft?.(peer)
    }
  }
  seen.clear()
  known.clear()
  for (const peer of next) {
    seen.add(peer.id)
    known.set(peer.id, peer)
  }
  hooks.onPeers?.(next)
}

export interface HostSession {
  receive(socketId: string, raw: string): void
  peerClosed(socketId: string): void
  close(): void
  sendChat(text: string): void
  sendPresence(body: PresenceBody): void
}

export function createHostSession(options: {
  selfId: string
  name: string
  colour: string
  code: string
  store: CoopStore
  transport: HostTransport
  hooks?: SessionHooks
}): HostSession {
  const { selfId, name, colour, code, store, transport } = options
  const hooks = options.hooks ?? {}
  const clients = new Map<string, Peer>()
  const seen = new Set<string>([selfId])
  const known = new Map<string, Peer>([[selfId, { id: selfId, name, colour }]])
  let hostSeq = 0
  let closed = false

  const roster = (): Peer[] => [{ id: selfId, name, colour }, ...clients.values()]

  const emitRoster = () => diffPeers(seen, known, roster(), hooks)

  const broadcast = (raw: string, except?: string) => {
    for (const socketId of clients.keys()) {
      if (socketId === except) continue
      transport.send(socketId, raw)
    }
  }

  const stopEdits = store.subscribeEdits((patches) => {
    if (closed || patches.length === 0) return
    hostSeq += 1
    broadcast(encodeMessage({ type: 'patches', from: selfId, seq: hostSeq, patches }))
  })

  const selfPeer = (): Peer => ({ id: selfId, name, colour })

  const drop = (socketId: string) => {
    if (!clients.delete(socketId)) return
    const peers = roster()
    broadcast(encodeMessage({ type: 'roster', peers }))
    emitRoster()
  }

  return {
    receive(socketId, raw) {
      if (closed) return
      const msg = parseMessage(raw)
      if (!msg) return
      if (msg.type === 'hello') {
        if (msg.version !== PROTOCOL_VERSION) {
          transport.send(socketId, encodeMessage({ type: 'bye', text: "This Nestwright build can't join that session." }))
          return
        }
        if (msg.code !== code) {
          transport.send(socketId, encodeMessage({ type: 'bye', text: 'That code does not match.' }))
          return
        }
        const peer: Peer = { id: msg.id, name: msg.name || 'Guest', colour: msg.colour }
        clients.set(socketId, peer)
        const peers = roster()
        transport.send(
          socketId,
          encodeMessage({ type: 'welcome', project: store.getProject(), peers, selfId: msg.id, seq: hostSeq }),
        )
        broadcast(encodeMessage({ type: 'roster', peers }), socketId)
        emitRoster()
        return
      }
      const peer = clients.get(socketId)
      if (!peer) return
      if (msg.type === 'patches') {
        try {
          store.applyRemotePatches(msg.patches)
        } catch {
          transport.send(socketId, encodeMessage({ type: 'sync', project: store.getProject(), seq: hostSeq }))
          return
        }
        hostSeq += 1
        const echoed = encodeMessage({ type: 'patches', from: peer.id, seq: hostSeq, patches: msg.patches })
        for (const id of clients.keys()) transport.send(id, echoed)
        return
      }
      if (msg.type === 'sync') {
        transport.send(socketId, encodeMessage({ type: 'sync', project: store.getProject(), seq: hostSeq }))
        return
      }
      if (msg.type === 'presence') {
        hooks.onPresence?.(msg)
        broadcast(encodeMessage(msg), socketId)
        return
      }
      if (msg.type === 'chat') {
        const speaker = clients.get(socketId) ?? selfPeer()
        hooks.onChat?.(speaker, msg.text)
        broadcast(encodeMessage({ type: 'chat', from: peer.id, text: msg.text }), socketId)
        return
      }
      if (msg.type === 'bye') drop(socketId)
    },
    peerClosed(socketId) {
      drop(socketId)
    },
    close() {
      if (closed) return
      closed = true
      stopEdits()
      broadcast(encodeMessage({ type: 'bye', from: selfId, text: 'The host left.' }))
      transport.close()
      clients.clear()
      hooks.onDisconnected?.()
    },
    sendChat(text) {
      const trimmed = text.slice(0, 500)
      if (!trimmed || closed) return
      hooks.onChat?.(selfPeer(), trimmed)
      broadcast(encodeMessage({ type: 'chat', from: selfId, text: trimmed }))
    },
    sendPresence(body) {
      if (closed) return
      const message: PresenceMessage = {
        type: 'presence',
        from: selfId,
        name,
        colour,
        levelId: body.levelId,
        cursor: body.cursor,
        camera: body.camera,
        selection: body.selection.slice(0, 100),
      }
      broadcast(encodeMessage(message))
    },
  }
}

export interface ClientSession {
  start(): void
  receive(raw: string): void
  close(): void
  sendChat(text: string): void
  sendPresence(body: PresenceBody): void
}

export function createClientSession(options: {
  selfId: string
  name: string
  colour: string
  code: string
  store: CoopStore
  transport: ClientTransport
  hooks?: SessionHooks
}): ClientSession {
  const { selfId, name, colour, code, store, transport } = options
  const hooks = options.hooks ?? {}
  const pending: PendingEdit[] = []
  const buffer = new Map<number, PatchesMessage>()
  const seen = new Set<string>()
  const known = new Map<string, Peer>()
  let expected = 1
  let joined = false
  let awaiting = false
  let closed = false
  let stopEdits: (() => void) | null = null
  const early: PatchesMessage[] = []

  const failSync = () => {
    if (awaiting || closed) return
    awaiting = true
    pending.length = 0
    buffer.clear()
    transport.send(encodeMessage({ type: 'sync', from: selfId }))
  }

  const rebaseApply = (patches: Patch[]) => {
    const stacked = pending.slice()
    for (let i = stacked.length - 1; i >= 0; i--) {
      const item = stacked[i]
      if (!item) continue
      try {
        store.applyRemotePatches(item.inverse)
      } catch {
        failSync()
        return
      }
    }
    try {
      store.applyRemotePatches(patches)
    } catch {
      failSync()
      return
    }
    for (const item of stacked) {
      try {
        store.applyRemotePatches(item.patches)
      } catch {
        failSync()
        return
      }
    }
  }

  const take = (msg: PatchesMessage) => {
    if (awaiting) return
    if (msg.seq < expected) return
    if (msg.seq > expected) {
      buffer.set(msg.seq, msg)
      return
    }
    expected = msg.seq + 1
    if (msg.from === selfId) pending.shift()
    else rebaseApply(msg.patches)
    if (awaiting) return
    const next = buffer.get(expected)
    if (!next) return
    buffer.delete(expected)
    take(next)
  }

  const onEdit = (patches: Patch[], inverse: Patch[]) => {
    if (closed || awaiting || !joined || patches.length === 0) return
    pending.push({ patches, inverse })
    transport.send(encodeMessage({ type: 'patches', from: selfId, seq: 0, patches }))
  }

  const applyRoster = (peers: Peer[]) => diffPeers(seen, known, peers, hooks)

  const seed = (peers: Peer[]) => {
    seen.clear()
    known.clear()
    for (const peer of peers) {
      seen.add(peer.id)
      known.set(peer.id, peer)
    }
    hooks.onPeers?.(peers)
  }

  const handle = (msg: NetMessage) => {
    if (msg.type === 'welcome') {
      expected = msg.seq + 1
      pending.length = 0
      buffer.clear()
      awaiting = false
      store.replaceProject(msg.project)
      joined = true
      seed(msg.peers)
      hooks.onWelcome?.(msg.peers)
      const queued = early.splice(0)
      for (const item of queued) take(item)
      return
    }
    if (msg.type === 'patches') {
      if (!joined) {
        early.push(msg)
        return
      }
      take(msg)
      return
    }
    if (msg.type === 'sync' && msg.project) {
      awaiting = false
      pending.length = 0
      buffer.clear()
      early.length = 0
      expected = (msg.seq ?? 0) + 1
      store.replaceProject(msg.project)
      hooks.onSynced?.()
      return
    }
    if (msg.type === 'roster') {
      if (!joined) seed(msg.peers)
      else applyRoster(msg.peers)
      return
    }
    if (msg.type === 'presence') {
      if (msg.from === selfId) return
      hooks.onPresence?.(msg)
      return
    }
    if (msg.type === 'chat') {
      if (msg.from === selfId) return
      const peer = known.get(msg.from) ?? { id: msg.from, name: msg.from, colour: '#E8B86D' }
      hooks.onChat?.(peer, msg.text)
      return
    }
    if (msg.type === 'bye') {
      hooks.onRejected?.(msg.text || 'Disconnected')
      transport.close()
    }
  }

  return {
    start() {
      if (closed) return
      stopEdits = store.subscribeEdits(onEdit)
      transport.send(
        encodeMessage({
          type: 'hello',
          id: selfId,
          name: name || 'Guest',
          colour,
          code,
          version: PROTOCOL_VERSION,
        }),
      )
    },
    receive(raw) {
      if (closed) return
      const msg = parseMessage(raw)
      if (!msg) return
      handle(msg)
    },
    close() {
      if (closed) return
      closed = true
      stopEdits?.()
      transport.close()
      hooks.onDisconnected?.()
    },
    sendChat(text) {
      const trimmed = text.slice(0, 500)
      if (!trimmed || closed || !joined) return
      hooks.onChat?.({ id: selfId, name: name || 'Guest', colour }, trimmed)
      transport.send(encodeMessage({ type: 'chat', from: selfId, text: trimmed }))
    },
    sendPresence(body) {
      if (closed || !joined) return
      transport.send(
        encodeMessage({
          type: 'presence',
          from: selfId,
          name,
          colour,
          levelId: body.levelId,
          cursor: body.cursor,
          camera: body.camera,
          selection: body.selection.slice(0, 100),
        }),
      )
    },
  }
}
