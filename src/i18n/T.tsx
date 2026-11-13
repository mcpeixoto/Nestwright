import { useTranslate } from './index'

export function T({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const tr = useTranslate()
  return <>{tr(k, vars)}</>
}
