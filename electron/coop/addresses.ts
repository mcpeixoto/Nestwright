import os from 'node:os'

export interface Nic {
  address: string
  family: string | number
  internal: boolean
}

/** Non-loopback IPv4 addresses. Loopback is left out so the host dialog can say when the LAN is missing. */
export function lanIPv4s(interfaces: ReturnType<typeof os.networkInterfaces> | Record<string, Nic[] | undefined>): string[] {
  const out: string[] = []
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      const v4 = entry.family === 'IPv4' || entry.family === 4
      if (v4 && !entry.internal) out.push(entry.address)
    }
  }
  return out
}
