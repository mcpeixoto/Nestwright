import { useSyncExternalStore } from 'react'
import { newId } from '../model/ids'
import { getPlanCursor } from '../plan2d/cursor'
import { getPlanRenderer } from '../plan2d/PlanRenderer'
import { fill, translate } from '../i18n'
import { getPlatform } from '../platform'
import { useSettings } from '../settings'
import { REDO_BLOCKED, UNDO_BLOCKED, useStore } from '../store'
import { getController } from '../view3d/SceneController'
import type { Peer } from './protocol'
import { websocketUrl } from './protocol'
import { clearPresence, removePresence, setSelfId, subscribePresence, upsertPresence } from './presence'
import {
  createClientSession,
  createHostSession,
  type ClientSession,
  type CoopStore,
  type HostSession,
  type PresenceBody,
  type SessionHooks,
} from './session'

const ADDRESS_KEY = 'nestwright.coopAddress'

function t(key: string): string {
  return translate(useSettings.getState().language, key)
}

function f(key: string, vars: Record<string, string | number>): string {
  return fill(useSettings.getState().language, key, vars)
}

export interface ChatLine {
  id: number
  from: string
  name: string
  colour: string
  text: string
}

export interface LiveState {
  role: 'idle' | 'host' | 'client'
  addresses: string[]
  port: number
  code: string
  peers: Peer[]
  chat: ChatLine[]
  error: string
  selfId: string
}

const IDLE: LiveState = {
  role: 'idle',
  addresses: [],
  port: 0,
  code: '',
  peers: [],
  chat: [],
  error: '',
  selfId: '',
}

let state: LiveState = IDLE
const listeners = new Set<() => void>()
let hostSessionHandle: HostSession | null = null
let clientSessionHandle: ClientSession | null = null
let unsubMessage: (() => void) | null = null
let unsubClose: (() => void) | null = null
let socket: WebSocket | null = null
let presenceTimer: ReturnType<typeof setInterval> | null = null
let intentional = false
let rejected = false
let chatSeq = 0

export interface ToastItem {
  id: number
  text: string
}

let toasts: ToastItem[] = []
let toastSeq = 0
const toastListeners = new Set<() => void>()

function emitLive(): void {
  for (const listener of listeners) listener()
}

function emitToasts(): void {
  for (const listener of toastListeners) listener()
}

export function getLive(): LiveState {
  return state
}

export function subscribeLive(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribeLive, getLive, getLive)
}

export function getToasts(): readonly ToastItem[] {
  return toasts
}

export function subscribeToasts(listener: () => void): () => void {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts, getToasts)
}

export function notify(text: string): void {
  if (!text) return
  const id = ++toastSeq
  toasts = [...toasts, { id, text }]
  emitToasts()
  try {
    useStore.getState().setMessage(text)
  } catch {
    /* store not ready */
  }
  setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id)
    emitToasts()
    try {
      if (useStore.getState().message === text) useStore.getState().setMessage('')
    } catch {
      /* ignore */
    }
  }, 4200)
}

function publish(partial: Partial<LiveState>): void {
  state = { ...state, ...partial }
  emitLive()
}

function pushChat(peer: Peer, text: string): void {
  const line: ChatLine = { id: ++chatSeq, from: peer.id, name: peer.name, colour: peer.colour, text }
  publish({ chat: [...state.chat, line].slice(-80) })
}

function identity(): { name: string; colour: string } {
  const settings = useSettings.getState()
  return {
    name: settings.playerName.trim() || t('Player'),
    colour: settings.playerColor || '#3FB8AF',
  }
}

function adapter(): CoopStore {
  return {
    getProject: () => useStore.getState().project,
    applyRemotePatches: (patches) => useStore.getState().applyRemotePatches(patches),
    subscribeEdits: (listener) => useStore.getState().subscribeEdits(listener),
    replaceProject: (project) => {
      try {
        useStore.getState().setProject(structuredClone(project))
      } catch {
        useStore.getState().setProject(project)
      }
    },
  }
}

function presenceBody(): PresenceBody {
  const store = useStore.getState()
  const cursor = getPlanCursor()
  const pose = getController()?.pose() ?? null
  return {
    levelId: store.activeLevelId,
    cursor: cursor ? { x: cursor.x, y: cursor.y } : null,
    selection: store.selection.slice(0, 100),
    camera: pose ?? undefined,
  }
}

function stopPresence(): void {
  if (presenceTimer) clearInterval(presenceTimer)
  presenceTimer = null
}

function startPresence(send: (body: PresenceBody) => void): void {
  stopPresence()
  let last = ''
  presenceTimer = setInterval(() => {
    try {
      const body = presenceBody()
      const key = JSON.stringify(body)
      if (key === last) return
      last = key
      send(body)
    } catch {
      /* a missing view must not kill the session */
    }
  }, 1000 / 15)
}

function detachSocket(): void {
  if (!socket) return
  socket.onclose = null
  socket.onmessage = null
  socket.onerror = null
  try {
    socket.close()
  } catch {
    /* already closed */
  }
  socket = null
}

function resetVisual(): void {
  stopPresence()
  unsubMessage?.()
  unsubClose?.()
  unsubMessage = null
  unsubClose = null
  detachSocket()
  clearPresence()
  hostSessionHandle = null
  clientSessionHandle = null
  state = { ...IDLE }
  emitLive()
}

function hooks(selfId: string): SessionHooks {
  return {
    onPeers(peers) {
      publish({ peers })
    },
    onJoined(peer) {
      notify(f('{name} joined', { name: peer.name }))
    },
    onLeft(peer) {
      notify(f('{name} left', { name: peer.name }))
      removePresence(peer.id)
    },
    onChat(peer, text) {
      pushChat(peer, text)
    },
    onPresence(message) {
      if (message.from === selfId) return
      upsertPresence({
        id: message.from,
        name: message.name,
        colour: message.colour,
        levelId: message.levelId,
        cursor: message.cursor,
        camera: message.camera,
        selection: message.selection,
      })
    },
    onRejected(text) {
      rejected = true
      const shown = t(text)
      publish({ error: shown, role: 'idle' })
      notify(shown)
    },
    onDisconnected() {
      const quiet = intentional || rejected
      const error = rejected ? state.error : ''
      intentional = false
      rejected = false
      const was = state.role
      resetVisual()
      if (error) publish({ error })
      if (!quiet) notify(t(was === 'idle' ? "Couldn't reach that address." : 'Disconnected'))
    },
    onSynced() {
      notify(t('Synced with your partner'))
    },
    onWelcome(peers) {
      publish({ role: 'client', peers, error: '' })
      const partner = peers.find((peer) => peer.id !== selfId)
      notify(partner ? f('Joined {name}', { name: partner.name }) : t('Joined'))
    },
  }
}

subscribePresence(() => {
  try {
    getPlanRenderer()?.requestDraw()
  } catch {
    /* plan not mounted */
  }
})

export function lastAddress(): string {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem(ADDRESS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberAddress(address: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(ADDRESS_KEY, address)
  } catch {
    /* private mode */
  }
}

export async function ensurePlayerName(): Promise<void> {
  try {
    if (useSettings.getState().playerName.trim()) return
    const platform = getPlatform()
    let name = ''
    if (platform.username) {
      try {
        name = (await platform.username()).trim()
      } catch {
        name = ''
      }
    }
    if (!useSettings.getState().playerName.trim()) {
      useSettings.getState().setSettings({ playerName: name || t('Player') })
    }
  } catch {
    /* settings unavailable */
  }
}

export async function leaveSession(): Promise<void> {
  if (!hostSessionHandle && !clientSessionHandle && state.role === 'idle') return
  intentional = true
  const wasHost = state.role === 'host'
  const closingHost = hostSessionHandle
  const closingClient = clientSessionHandle
  hostSessionHandle = null
  clientSessionHandle = null
  closingHost?.close()
  closingClient?.close()
  if (wasHost) {
    try {
      await getPlatform().leaveSession?.()
    } catch {
      /* the server may already be gone */
    }
  }
  resetVisual()
  notify(t('Left the session'))
}

export async function startHosting(): Promise<void> {
  const platform = getPlatform()
  if (!platform.isElectron || !platform.hostSession) {
    publish({ error: 'browser' })
    return
  }
  if (state.role !== 'idle') await leaveSession()
  intentional = false
  rejected = false
  const selfId = newId('peer')
  const who = identity()
  const queued: { peerId: string; raw: string }[] = []
  let session: HostSession | null = null
  unsubMessage =
    platform.onCoopMessage?.((msg) => {
      if (session) session.receive(msg.peerId, msg.raw)
      else queued.push(msg)
    }) ?? null
  unsubClose =
    platform.onCoopClose?.((msg) => {
      session?.peerClosed(msg.peerId)
    }) ?? null
  let info: { addresses: string[]; port: number; code: string }
  try {
    info = await platform.hostSession()
  } catch (err) {
    unsubMessage?.()
    unsubClose?.()
    unsubMessage = null
    unsubClose = null
    publish({ error: t(err instanceof Error ? err.message : 'Could not start hosting') })
    return
  }
  session = createHostSession({
    selfId,
    name: who.name,
    colour: who.colour,
    code: info.code,
    store: adapter(),
    transport: {
      send(peerId, raw) {
        getPlatform().coopSend?.(peerId, raw)
      },
      close() {},
    },
    hooks: hooks(selfId),
  })
  hostSessionHandle = session
  for (const msg of queued) session.receive(msg.peerId, msg.raw)
  setSelfId(selfId)
  publish({
    role: 'host',
    addresses: info.addresses,
    port: info.port,
    code: info.code,
    selfId,
    error: '',
    peers: [{ id: selfId, name: who.name, colour: who.colour }],
    chat: [],
  })
  startPresence((body) => session?.sendPresence(body))
}

export async function joinSession(address: string, code: string): Promise<void> {
  const url = websocketUrl(address)
  if (!url) {
    publish({ error: t('Enter an address like 192.168.1.20') })
    return
  }
  const cleaned = code.trim().toUpperCase()
  if (!/^[A-Z]{4}$/.test(cleaned)) {
    publish({ error: t('The code is four letters.') })
    return
  }
  if (typeof WebSocket === 'undefined') {
    publish({ error: t('This environment has no WebSocket.') })
    return
  }
  rememberAddress(address.trim())
  if (state.role !== 'idle') await leaveSession()
  intentional = false
  rejected = false
  const selfId = newId('peer')
  const who = identity()
  const ws = new WebSocket(url)
  socket = ws
  const pending: string[] = []
  const session = createClientSession({
    selfId,
    name: who.name,
    colour: who.colour,
    code: cleaned,
    store: adapter(),
    transport: {
      send(raw) {
        if (ws.readyState === WebSocket.OPEN) ws.send(raw)
        else pending.push(raw)
      },
      close() {
        ws.close()
      },
    },
    hooks: hooks(selfId),
  })
  clientSessionHandle = session
  setSelfId(selfId)
  publish({ role: 'client', selfId, error: '', code: cleaned, peers: [], chat: [] })
  ws.onopen = () => {
    for (const raw of pending.splice(0)) ws.send(raw)
  }
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') session.receive(event.data)
  }
  ws.onerror = () => {
    /* close follows */
  }
  ws.onclose = () => {
    if (clientSessionHandle === session) session.close()
  }
  session.start()
  startPresence((body) => session.sendPresence(body))
}

export function sendChat(text: string): void {
  const trimmed = text.trim().slice(0, 500)
  if (!trimmed) return
  if (hostSessionHandle) hostSessionHandle.sendChat(trimmed)
  else if (clientSessionHandle) clientSessionHandle.sendChat(trimmed)
  else notify(t('Join a session to chat.'))
}

useStore.subscribe((state, prev) => {
  if (state.message === prev.message) return
  const language = useSettings.getState().language
  if (state.message === translate(language, UNDO_BLOCKED) || state.message === translate(language, REDO_BLOCKED)) notify(state.message)
})
