import { describe, expect, it } from 'vitest'
import { lanIPv4s } from '../../electron/coop/addresses'

describe('lan addresses', () => {
  it('keeps external IPv4 and drops loopback and IPv6', () => {
    const found = lanIPv4s({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
    })
    expect(found).toEqual(['192.168.1.20'])
  })
})
