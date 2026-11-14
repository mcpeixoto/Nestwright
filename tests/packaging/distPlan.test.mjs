import { describe, expect, it } from 'vitest'
import { distPlan, macIdentity, notarizeCredentials } from '../../scripts/packaging/dist-plan.mjs'

const API = { APPLE_API_KEY: '/k/AuthKey_X.p8', APPLE_API_KEY_ID: 'X', APPLE_API_ISSUER: 'i' }

describe('dist plan', () => {
  it('builds an unsigned universal mac app when no signing env is set', () => {
    const plan = distPlan('mac', {})
    expect(plan.signed).toBe(false)
    expect(plan.notarized).toBe(false)
    expect(plan.args).toEqual(['--publish', 'never', '--mac', '--universal', '-c.mac.identity=null', '-c.mac.notarize=false'])
  })

  it('signs without notarising when only an identity is given', () => {
    const plan = distPlan('mac', { NESTWRIGHT_MAC_IDENTITY: 'Developer ID Application: Ada (TEAM1)' })
    expect(plan.signed).toBe(true)
    expect(plan.notarized).toBe(false)
    expect(plan.args).toContain('-c.mac.identity=Ada (TEAM1)')
    expect(plan.args).toContain('-c.mac.notarize=false')
  })

  it('notarises when a full credential set is present', () => {
    const plan = distPlan('mac', { CSC_NAME: 'Ada (TEAM1)', ...API })
    expect(plan.notarized).toBe(true)
    expect(plan.args).not.toContain('-c.mac.notarize=false')
  })

  it('ignores partial notarisation credentials', () => {
    expect(notarizeCredentials({ APPLE_API_KEY: 'k', APPLE_API_KEY_ID: 'x' })).toBeNull()
    expect(notarizeCredentials({ APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'p', APPLE_TEAM_ID: 't' })).toBe('APPLE_ID')
    expect(notarizeCredentials({ APPLE_KEYCHAIN_PROFILE: 'nest' })).toBe('APPLE_KEYCHAIN_PROFILE')
    expect(notarizeCredentials(API)).toBe('APPLE_API_KEY')
    expect(macIdentity({ NESTWRIGHT_MAC_IDENTITY: '  ' })).toBeNull()
  })

  it('targets x64 for Windows and Linux and never publishes', () => {
    expect(distPlan('win', {}).args).toEqual(['--publish', 'never', '--win', '--x64'])
    expect(distPlan('linux', {}).args).toEqual(['--publish', 'never', '--linux', '--x64'])
    expect(() => distPlan('ios', {})).toThrow(/Unknown target/)
  })
})
