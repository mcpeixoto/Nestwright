// Noto Sans (Latin subset, OFL-1.1; see docs/ASSETS.md) inlined as data URLs by Vite, so the
// same import works in `vite build`, the Electron bundle and vitest.
import boldUrl from './fonts/NotoSans-Bold-latin.ttf?inline'
import regularUrl from './fonts/NotoSans-Regular-latin.ttf?inline'

export const PLAN_FONT = 'NotoSans'

function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export const PLAN_FONT_FILES = [
  { file: 'NotoSans-Regular-latin.ttf', style: 'normal', base64: base64Of(regularUrl) },
  { file: 'NotoSans-Bold-latin.ttf', style: 'bold', base64: base64Of(boldUrl) },
] as const
