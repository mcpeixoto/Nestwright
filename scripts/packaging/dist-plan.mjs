// Pure decision logic for scripts/dist.mjs, kept separate so it can be unit tested.

const NOTARIZE_SETS = [
  ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
  ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  ['APPLE_KEYCHAIN_PROFILE'],
]

const has = (env, key) => typeof env[key] === 'string' && env[key].trim().length > 0

/** Which notarisation credential set electron-builder will pick up, or null. */
export function notarizeCredentials(env) {
  for (const set of NOTARIZE_SETS) {
    if (set.every((key) => has(env, key))) return set[0]
  }
  return null
}

/** electron-builder wants the certificate name without the "Developer ID Application: " prefix. */
export function macIdentity(env) {
  const raw = (has(env, 'NESTWRIGHT_MAC_IDENTITY') ? env.NESTWRIGHT_MAC_IDENTITY : has(env, 'CSC_NAME') ? env.CSC_NAME : '').trim()
  if (!raw) return null
  return raw.replace(/^Developer ID Application:\s*/, '')
}

/**
 * Arguments for electron-builder plus a human-readable summary.
 * An absent signing env means an unsigned build that still packages, never a failure.
 */
export function distPlan(target, env = {}) {
  const args = ['--publish', 'never']
  const notes = []
  if (target === 'mac') {
    args.push('--mac', '--universal')
    const identity = macIdentity(env)
    if (!identity) {
      args.push('-c.mac.identity=null', '-c.mac.notarize=false')
      notes.push('unsigned (set NESTWRIGHT_MAC_IDENTITY to sign)')
      return { args, signed: false, notarized: false, notes }
    }
    args.push(`-c.mac.identity=${identity}`)
    notes.push(`signed as "${identity}"`)
    const creds = notarizeCredentials(env)
    if (!creds) {
      args.push('-c.mac.notarize=false')
      notes.push('not notarised (no APPLE_API_KEY*, APPLE_ID* or APPLE_KEYCHAIN_PROFILE env)')
      return { args, signed: true, notarized: false, notes }
    }
    notes.push(`notarised via ${creds}`)
    return { args, signed: true, notarized: true, notes }
  }
  if (target === 'win') {
    args.push('--win', '--x64')
    // Without a certificate electron-builder skips Authenticode; Steam does not require it.
    notes.push(has(env, 'WIN_CSC_LINK') || has(env, 'CSC_LINK') ? 'Authenticode-signed' : 'unsigned (Steam does not require it)')
    return { args, signed: has(env, 'WIN_CSC_LINK') || has(env, 'CSC_LINK'), notarized: false, notes }
  }
  if (target === 'linux') {
    args.push('--linux', '--x64')
    return { args, signed: false, notarized: false, notes }
  }
  throw new Error(`Unknown target "${target}" (mac, win or linux)`)
}
