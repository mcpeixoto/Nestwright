/** Short ids: prefix plus 10 hex chars. Unique enough for a single project. */
export function newId(prefix: string): string {
  const hex = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `${prefix}_${hex}`
}
