type CoopModule = {
  openJoinDialog?: () => void
  showJoin?: () => void
}

const loaders = import.meta.glob('../../net/**/*.{ts,tsx}')

export function coopJoinAvailable(): boolean {
  return Object.keys(loaders).length > 0
}

export async function openCoopJoin(): Promise<boolean> {
  for (const load of Object.values(loaders)) {
    try {
      const mod = (await load()) as CoopModule
      const open = mod.openJoinDialog ?? mod.showJoin
      if (typeof open === 'function') {
        open()
        return true
      }
    } catch {
      /* a module that fails to load is not a join dialog */
    }
  }
  return false
}
