/** Best stars already earned. A later submit can raise a brief, never lower it. */
export function raiseBriefStars(
  current: Record<string, number>,
  id: string,
  stars: number,
): Record<string, number> {
  if (!id || typeof stars !== 'number' || !Number.isFinite(stars)) return current
  const next = Math.min(3, Math.floor(stars))
  if (next <= 0) return current
  const previous = current[id]
  const had = typeof previous === 'number' && Number.isFinite(previous) ? Math.min(3, Math.floor(previous)) : 0
  if (next <= had) return current
  return { ...current, [id]: next }
}

/** Keep every stored brief, and take the higher count when both sides name one. */
export function combineBriefStars(
  current: Record<string, number> | undefined,
  incoming: Record<string, number> | undefined,
): Record<string, number> {
  let next = current ?? {}
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return next
  for (const [id, stars] of Object.entries(incoming)) next = raiseBriefStars(next, id, stars)
  return next
}

/** Older settings files omit the field. Junk and non-positive counts are dropped. */
export function normalizeBriefStars(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!id || typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const stars = Math.min(3, Math.floor(raw))
    if (stars <= 0) continue
    out[id] = stars
  }
  return out
}
