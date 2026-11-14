export function reviewLock(lock) {
  const errors = []
  if (!lock || typeof lock !== 'object') return ['lock is not an object']
  if (!Number.isInteger(lock.version) || lock.version < 0) errors.push('lock.version must be an integer ≥ 0')
  if (lock.tarball == null) {
    if (lock.sha256 != null) errors.push('lock.sha256 must be null when tarball is null')
  } else if (typeof lock.tarball !== 'string' || !/^content-v\d+\.tar\.(zst|gz)$/.test(lock.tarball)) {
    errors.push('lock.tarball must be content-vN.tar.zst, content-vN.tar.gz, or null')
  } else if (typeof lock.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(lock.sha256)) {
    errors.push('lock.sha256 must be a sha256 hex digest')
  }
  return errors
}

export function nextArchive(lock, compression) {
  const version = Number(lock?.version ?? 0) + 1
  const ext = compression === 'zstd' ? 'tar.zst' : 'tar.gz'
  return { version, tarball: `content-v${version}.${ext}` }
}

export function releaseTag(tarball) {
  const match = /^(content-v\d+)\.tar\.(zst|gz)$/.exec(tarball ?? '')
  if (!match) throw new Error(`unrecognised content pack name ${tarball}`)
  return match[1]
}

export function releaseAssetUrl(repo, tarball) {
  return `https://github.com/${repo}/releases/download/${releaseTag(tarball)}/${tarball}`
}

/** What `content:fetch` should do with the committed lock. */
export function fetchPackPlan(lock) {
  if (lock?.tarball == null) return { action: 'skip', message: 'no content pack; procedural fallback' }
  return { action: 'download', tag: releaseTag(lock.tarball), file: lock.tarball, sha256: lock.sha256 }
}
