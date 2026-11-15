import { useSettings } from '../settings'
import { installAmbience } from './ambience'
import { sceneAmbienceInput } from './ambienceScene'
import { applyBusGains, bindAudioGesture, releaseAudioGesture } from './engine'
import { installEditSounds } from './edits'
import { sfx } from './sfx'

let installed = false

/** Top-bar and tool-rail buttons, including flyouts. Not a disabled control. */
export function isChromeButton(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false
  const button = target.closest('button')
  if (!(button instanceof HTMLButtonElement)) return false
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false
  return button.closest('.topbar, .rail') != null
}

/** Gesture unlock, chrome clicks, edit stingers, and live slider gains. Once per mount. */
export function installAudio(): () => void {
  if (installed) return () => {}
  installed = true
  const stops: Array<() => void> = []
  if (typeof window !== 'undefined') {
    bindAudioGesture(window)
    const onClick = (event: Event) => {
      if (isChromeButton(event.target)) sfx('click')
    }
    window.addEventListener('click', onClick, true)
    stops.push(() => window.removeEventListener('click', onClick, true))
    stops.push(() => releaseAudioGesture())
  }
  stops.push(installEditSounds())
  stops.push(installAmbience(sceneAmbienceInput))
  stops.push(useSettings.subscribe(() => applyBusGains()))
  applyBusGains()
  return () => {
    installed = false
    for (const stop of stops) stop()
  }
}
