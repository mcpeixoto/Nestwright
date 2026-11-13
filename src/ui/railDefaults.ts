export const GROUP_DEFAULTS: Record<string, string> = {
  build: 'wall',
  openings: 'door',
  interior: 'paint',
  outside: 'terrain-sculpt',
  measure: 'measure',
}

export interface RailTool {
  id: string
}

/**
 * The icon on a rail group. The remembered tool applies only after the user
 * has chosen one in that group; otherwise the group's explicit default.
 */
export function railIconTool<T extends RailTool>(
  groupTools: readonly T[],
  groupId: string,
  activeId: string,
  remembered: string | undefined,
): T | undefined {
  const active = groupTools.find((item) => item.id === activeId)
  if (active) return active
  if (remembered) {
    const chosen = groupTools.find((item) => item.id === remembered)
    if (chosen) return chosen
  }
  const fallback = GROUP_DEFAULTS[groupId]
  return groupTools.find((item) => item.id === fallback) ?? groupTools[0]
}
