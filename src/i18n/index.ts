import { useSettings } from '../settings'
import { en, type MessageKey } from './en'
import { pt } from './pt'

export type { MessageKey }

export function languageOf(language: string): 'en' | 'pt-PT' {
  return language === 'pt-PT' || language === 'pt' ? 'pt-PT' : 'en'
}

export function translate(language: string, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(en, key)) return key
  const typed = key as MessageKey
  return languageOf(language) === 'pt-PT' ? pt[typed] : en[typed]
}

export function fill(language: string, key: string, vars: Record<string, string | number>): string {
  return translate(language, key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}

export function useTranslate(): (key: string, vars?: Record<string, string | number>) => string {
  const language = useSettings((s) => s.language)
  return (key, vars) => (vars ? fill(language, key, vars) : translate(language, key))
}
