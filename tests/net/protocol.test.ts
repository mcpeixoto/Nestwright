import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/model/defaults'
import { encodeMessage, parseMessage, randomCode, websocketUrl } from '../../src/net/protocol'

describe('protocol', () => {
  it('draws a 4-letter code from the alphabet only', () => {
    const code = randomCode(() => 0)
    expect(code).toBe('AAAA')
    expect(randomCode(() => 0.999)).toMatch(/^[A-Z]{4}$/)
    expect(randomCode(() => 25 / 26)).toBe('ZZZZ')
  })

  it('round-trips a hello and rejects junk', () => {
    const raw = encodeMessage({
      type: 'hello',
      id: 'bea',
      name: 'Bea',
      colour: '#E8B86D',
      code: 'NEST',
      version: 1,
    })
    expect(parseMessage(raw)).toMatchObject({ type: 'hello', code: 'NEST' })
    expect(parseMessage('not json')).toBeNull()
    expect(parseMessage('{"type":"nope"}')).toBeNull()
    const welcome = encodeMessage({
      type: 'welcome',
      project: createProject('Home', 'house'),
      peers: [{ id: 'ada', name: 'Ada', colour: '#3FB8AF' }],
      selfId: 'bea',
      seq: 0,
    })
    expect(parseMessage(welcome)?.type).toBe('welcome')
  })

  it('builds a websocket url and refuses a blank address', () => {
    expect(websocketUrl('192.168.1.20')).toBe('ws://192.168.1.20:47321')
    expect(websocketUrl('ws://10.0.0.4:48000')).toBe('ws://10.0.0.4:48000')
    expect(websocketUrl('  ')).toBeNull()
    expect(websocketUrl('host/path')).toBeNull()
  })
})
