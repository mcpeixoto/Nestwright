/**
 * Base-game third-party art may be CC0 or CC-BY 4.0.
 * NC, ND and SA (and the long forms of those clauses) are rejected even when
 * the rest of the string looks familiar.
 */

export function reviewLicence(licence) {
  const normalised = String(licence ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const compact = normalised.replace(/-/g, '')
  const tokens = normalised.split(/[^A-Z0-9]+/).filter(Boolean)
  const banned = []
  if (tokens.includes('NC') || compact.includes('NONCOMMERCIAL')) banned.push('NC')
  if (tokens.includes('ND') || compact.includes('NODERIVATIVE')) banned.push('ND')
  if (tokens.includes('SA') || compact.includes('SHAREALIKE')) banned.push('SA')
  const allowed = (normalised === 'CC0' || normalised === 'CC-BY-4.0') && banned.length === 0
  return { allowed, banned, normalised }
}

export function assertAllowedLicence(licence, where) {
  const review = reviewLicence(licence)
  if (!review.allowed) {
    const why = review.banned.length ? ` (forbidden clause: ${review.banned.join(', ')})` : ''
    throw new Error(`${where} licence ${JSON.stringify(licence)} is not allowed${why}`)
  }
  return review.normalised
}
