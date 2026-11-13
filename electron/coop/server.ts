import os from 'node:os'
import { WebSocketServer, type WebSocket } from 'ws'
import { COOP_PORT, randomCode } from '../../src/net/protocol'
import { lanIPv4s } from './addresses'

export interface CoopHostInfo {
  addresses: string[]
  port: number
  code: string
}

interface Sink {
  message(peerId: string, raw: string): void
  closed(peerId: string): void
}

let server: WebSocketServer | null = null
let info: CoopHostInfo | null = null
let sink: Sink | null = null
const sockets = new Map<string, WebSocket>()
let nextId = 0

function asText(data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (Array.isArray(data)) {
    const parts = data.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part)))
    return Buffer.concat(parts).toString('utf8')
  }
  return ''
}

function openPort(port: number): Promise<{ wss: WebSocketServer; port: number }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const wss = new WebSocketServer({ host: '0.0.0.0', port }, () => {
      if (settled) return
      settled = true
      const addr = wss.address()
      const actual = typeof addr === 'object' && addr ? addr.port : port
      resolve({ wss, port: actual })
    })
    wss.once('error', (err) => {
      if (settled) return
      settled = true
      wss.close()
      reject(err)
    })
  })
}

export function setCoopSink(next: Sink | null): void {
  sink = next
}

export async function startCoopHost(): Promise<CoopHostInfo> {
  if (server && info) return info
  let opened: { wss: WebSocketServer; port: number }
  try {
    opened = await openPort(COOP_PORT)
  } catch {
    opened = await openPort(0)
  }
  server = opened.wss
  const found = lanIPv4s(os.networkInterfaces())
  info = {
    addresses: found.length > 0 ? found : ['127.0.0.1'],
    port: opened.port,
    code: randomCode(),
  }
  server.on('connection', (socket) => {
    const peerId = `s${++nextId}`
    sockets.set(peerId, socket)
    socket.on('message', (data) => {
      try {
        sink?.message(peerId, asText(data))
      } catch {
        /* a bad frame must not take down the session */
      }
    })
    const drop = () => {
      if (!sockets.delete(peerId)) return
      try {
        sink?.closed(peerId)
      } catch {
        /* renderer already gone */
      }
    }
    socket.on('close', drop)
    socket.on('error', () => socket.close())
  })
  return info
}

export function coopSend(peerId: string | null, raw: string): void {
  if (!raw) return
  if (peerId) {
    sockets.get(peerId)?.send(raw)
    return
  }
  for (const socket of sockets.values()) socket.send(raw)
}

export function stopCoopHost(): void {
  for (const socket of sockets.values()) {
    try {
      socket.close()
    } catch {
      /* already closed */
    }
  }
  sockets.clear()
  server?.close()
  server = null
  info = null
  sink = null
}

export function coopUsername(): string {
  try {
    return os.userInfo().username
  } catch {
    return ''
  }
}
