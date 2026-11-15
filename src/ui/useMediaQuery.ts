import { useSyncExternalStore } from 'react'

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

/** True when the viewport matches `query`. Missing matchMedia counts as not matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = mediaList(query)
      if (!list) return () => {}
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => mediaList(query)?.matches ?? false,
    () => false,
  )
}
