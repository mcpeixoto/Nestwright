import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/model/defaults'
import type { Project } from '../../src/model/types'
import type { CoopStore, HostSession, ClientSession } from '../../src/net/session'
import { createClientSession, createHostSession } from '../../src/net/session'
import { encodeMessage } from '../../src/net/protocol'

enablePatches()

interface MemoryStore extends CoopStore {
  apply(recipe: (draft: Project) => void): void
  overwrite(project: Project): void
  applied: Patch[][]
}

function memoryStore(project: Project): MemoryStore {
  let current = project
  const edits = new Set<(patches: Patch[], inverse: Patch[]) => void>()
  const applied: Patch[][] = []
  return {
    applied,
    getProject: () => current,
    apply(recipe) {
      const [next, patches, inverse] = produceWithPatches(current, recipe)
      if (patches.length === 0) return
      current = next as Project
      for (const listener of edits) listener(patches, inverse)
    },
    applyRemotePatches(patches) {
      current = applyPatches(current, patches) as Project
      applied.push(patches)
    },
    subscribeEdits(listener) {
      edits.add(listener)
      return () => edits.delete(listener)
    },
    replaceProject(next) {
      current = next
    },
    overwrite(next) {
      current = next
    },
  }
}

function makeLink() {
  let toHost: (socketId: string, raw: string) => void = () => {}
  let toClient: (raw: string) => void = () => {}
  const held: string[] = []
  let hold = false
  return {
    host: {
      send(_peerId: string, raw: string) {
        toClient(raw)
      },
      close() {},
    },
    client: {
      send(raw: string) {
        if (hold) held.push(raw)
        else toHost('c1', raw)
      },
      close() {},
    },
    attach(host: HostSession, client: ClientSession) {
      toHost = (id, raw) => host.receive(id, raw)
      toClient = (raw) => client.receive(raw)
    },
    holdToHost() {
      hold = true
    },
    releaseToHost() {
      hold = false
      for (const raw of held.splice(0)) toHost('c1', raw)
    },
  }
}

function setup(clientCode = 'NEST') {
  const hostStore = memoryStore(structuredClone(createProject('Blank', 'house')))
  const clientStore = memoryStore(createProject('Other', 'house'))
  const link = makeLink()
  const joined: string[] = []
  const host = createHostSession({
    selfId: 'ada',
    name: 'Ada',
    colour: '#3FB8AF',
    code: 'NEST',
    store: hostStore,
    transport: link.host,
    hooks: { onJoined: (peer) => joined.push(peer.name) },
  })
  const client = createClientSession({
    selfId: 'bea',
    name: 'Bea',
    colour: '#E8B86D',
    code: clientCode,
    store: clientStore,
    transport: link.client,
  })
  link.attach(host, client)
  client.start()
  return { host, client, hostStore, clientStore, link, joined }
}

describe('co-op session', () => {
  it('rejects a wrong code and does not hand over the project', () => {
    const { clientStore } = setup('XXXX')
    expect(clientStore.getProject().name).toBe('Other')
  })

  it('applies host patches in order, including ones that arrive out of order', () => {
    const { hostStore, clientStore, client } = setup()
    expect(clientStore.getProject().name).toBe('Blank')
    hostStore.apply((draft) => {
      draft.name = 'First'
    })
    hostStore.apply((draft) => {
      draft.units = 'imperial'
    })
    expect(clientStore.getProject().name).toBe('First')
    expect(clientStore.getProject().units).toBe('imperial')
    expect(clientStore.applied.map((patches) => patches[0]?.path[0])).toEqual(['name', 'units'])

    client.receive(
      encodeMessage({
        type: 'patches',
        from: 'ada',
        seq: 4,
        patches: [{ op: 'replace', path: ['name'], value: 'Two' }],
      }),
    )
    expect(clientStore.getProject().name).toBe('First')
    client.receive(
      encodeMessage({
        type: 'patches',
        from: 'ada',
        seq: 3,
        patches: [{ op: 'replace', path: ['name'], value: 'One' }],
      }),
    )
    expect(clientStore.getProject().name).toBe('Two')
  })

  it('lets the later edit win when the two cross, without applying a wish twice', () => {
    const { hostStore, clientStore, link, joined } = setup()
    expect(joined).toEqual(['Bea'])
    link.holdToHost()
    clientStore.apply((draft) => {
      draft.name = 'Client'
    })
    hostStore.apply((draft) => {
      draft.name = 'Host'
    })
    expect(clientStore.getProject().name).toBe('Client')
    link.releaseToHost()
    expect(hostStore.getProject().name).toBe('Client')
    expect(clientStore.getProject().name).toBe('Client')

    clientStore.apply((draft) => {
      draft.wishes.push({
        id: 'w1',
        author: 'Bea',
        target: { kind: 'point', levelId: draft.levels[0]?.id ?? '', at: { x: 1, y: 1 } },
        reaction: 'love',
        note: '',
        createdAt: 1,
      })
    })
    expect(hostStore.getProject().wishes).toHaveLength(1)
    expect(clientStore.getProject().wishes).toHaveLength(1)
  })

  it('asks for a full sync when a patch cannot be applied', () => {
    const { hostStore, clientStore } = setup()
    const broken = structuredClone(clientStore.getProject())
    broken.levels = []
    clientStore.overwrite(broken)
    hostStore.apply((draft) => {
      const level = draft.levels[0]
      if (level) level.name = 'Renamed'
    })
    expect(clientStore.getProject().levels).toHaveLength(1)
    expect(clientStore.getProject().levels[0]?.name).toBe('Renamed')
    expect(hostStore.getProject().levels[0]?.name).toBe('Renamed')
  })
})
