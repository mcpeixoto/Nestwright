import { useSettings, type ThemeSetting } from '../settings'

export function applyTheme(theme: ThemeSetting, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme
}

/** Apply the saved theme and keep `<html data-theme>` in step with Settings. */
export function installTheme(): () => void {
  applyTheme(useSettings.getState().theme)
  return useSettings.subscribe((state, prev) => {
    if (state.theme === prev.theme) return
    applyTheme(state.theme)
  })
}

export default installTheme
