export const TEMPLATE_IDS: readonly string[]
export const QUALITIES: readonly string[]
export const LEVEL_DISPLAYS: readonly string[]

export function defaultRefDir(): string
export function validateViews(views: unknown): string[]
export function seatLook(position: number[], target: number[], maxPolar?: number): number[]
export function parseArgs(argv: string[]): {
  out: string
  url: string
  views: string[] | null
  serve: boolean
  ref: string
  backend: 'webgpu' | 'webgl'
  help: boolean
}
export function escapeHtml(value: unknown): string
export function contactHtml(input: {
  shots: { name: string; src?: string; report?: object; error?: string }[]
  refs?: { name: string; src: string }[] | null
}): string
