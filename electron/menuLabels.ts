import type { MenuItemConstructorOptions } from 'electron'

/** Menu bar labels, translated by the renderer and sent with `nestwright:editor-state`. */
export interface MenuLabels {
  file: string
  new: string
  open: string
  save: string
  saveAs: string
  close: string
  view: string
  fullscreen: string
  help: string
  tutorial: string
  shortcuts: string
  credits: string
  achievements: string
  about: string
}

export const DEFAULT_MENU_LABELS: MenuLabels = {
  file: 'File',
  new: 'New',
  open: 'Open…',
  save: 'Save',
  saveAs: 'Save As…',
  close: 'Close Window',
  view: 'View',
  fullscreen: 'Fullscreen',
  help: 'Help',
  tutorial: 'Tutorial',
  shortcuts: 'Shortcuts',
  credits: 'Credits',
  achievements: 'Achievements',
  about: 'About Nestwright',
}

const KEYS = Object.keys(DEFAULT_MENU_LABELS) as (keyof MenuLabels)[]

export function isMenuLabels(value: unknown): value is MenuLabels {
  if (!value || typeof value !== 'object') return false
  const menu = value as Record<string, unknown>
  return KEYS.every((key) => typeof menu[key] === 'string')
}

export type HelpAction = 'tutorial' | 'shortcuts' | 'credits' | 'achievements'

/** Help menu. Outside macOS it also carries About (macOS has it in the app menu). */
export function helpMenuTemplate(
  labels: MenuLabels,
  send: (action: HelpAction) => void,
  platform: NodeJS.Platform,
  about?: MenuItemConstructorOptions,
): MenuItemConstructorOptions {
  const item = (label: string, action: HelpAction): MenuItemConstructorOptions => ({ label, click: () => send(action) })
  const submenu: MenuItemConstructorOptions[] = [
    item(labels.tutorial, 'tutorial'),
    item(labels.shortcuts, 'shortcuts'),
    item(labels.credits, 'credits'),
    item(labels.achievements, 'achievements'),
  ]
  if (platform !== 'darwin') submenu.push(about ?? { label: labels.about })
  return { label: labels.help, submenu }
}

export function viewMenuTemplate(
  labels: MenuLabels,
  state: { fullscreen: boolean; toggle: () => void },
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions {
  return {
    label: labels.view,
    submenu: [
      { role: 'reload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      {
        label: labels.fullscreen,
        type: 'checkbox',
        checked: state.fullscreen,
        accelerator: platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
        click: () => state.toggle(),
      },
    ],
  }
}
