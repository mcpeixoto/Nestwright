import { useSyncExternalStore } from 'react'
import { coopJoinAvailable } from './start/coop'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import {
  AUTOSAVE_CHOICES,
  useSettings,
  type AppLanguage,
  type GraphicsQuality,
  type RendererBackendSetting,
  type ToneMapSetting,
} from '../settings'
import { useStore } from '../store'
import { Modal } from './Modal'
import { isSettingsOpen, setSettingsOpen, subscribeSettings } from './settingsDialogState'
import { registerTopBarAction } from './topbar/registry'

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']
const BACKENDS: RendererBackendSetting[] = ['auto', 'webgpu', 'webgl']
/** 0 follows the graphics tier. */
const RENDER_SCALES = [0, 0.5, 0.67, 0.8, 1] as const

function SettingsButton() {
  const tr = useTranslate()
  const open = useSyncExternalStore(subscribeSettings, isSettingsOpen, () => false)
  return (
    <button type="button" className={open ? 'on' : ''} onClick={() => setSettingsOpen(!open)}>
      {tr('Settings')}
    </button>
  )
}

registerTopBarAction({
  id: 'settings',
  label: 'Settings',
  order: 70,
  Component: SettingsButton,
})

export function SettingsDialog() {
  const open = useSyncExternalStore(subscribeSettings, isSettingsOpen, () => false)
  const settings = useSettings()
  const tr = useTranslate()
  if (!open) return null
  const set = useSettings.getState().setSettings
  const showPlayer = coopJoinAvailable()
  return (
    <Modal className="settings-dialog" label={tr('Settings')} onClose={() => setSettingsOpen(false)}>
        <h2>
          <T k="Settings" />
        </h2>
        <label className="field">
          <T k="Language" />
          <select value={settings.language} onChange={(event) => set({ language: event.target.value as AppLanguage })}>
            <option value="en">{tr('English')}</option>
            <option value="pt-PT">{tr('Portuguese (Portugal)')}</option>
          </select>
        </label>
        <label className="field">
          <T k="Units" />
          <select
            value={settings.units}
            onChange={(event) => {
              const units = event.target.value === 'imperial' ? 'imperial' : 'metric'
              set({ units })
              useStore.getState().apply('Units', (draft) => {
                draft.units = units
              })
            }}
          >
            <option value="metric">{tr('Metric')}</option>
            <option value="imperial">{tr('Imperial')}</option>
          </select>
        </label>
        <label className="field">
          <T k="Graphics" />
          <select
            value={settings.graphicsQuality}
            onChange={(event) => set({ graphicsQuality: event.target.value as GraphicsQuality })}
          >
            {QUALITIES.map((quality) => (
              <option key={quality} value={quality}>
                {tr(quality === 'low' ? 'Low' : quality === 'medium' ? 'Medium' : quality === 'high' ? 'High' : 'Ultra')}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.qualityAuto}
            onChange={(event) => set({ qualityAuto: event.target.checked })}
          />
          <T k="Pick graphics automatically" />
        </label>
        <label className="field">
          <T k="Render scale" />
          <select value={String(settings.renderScale)} onChange={(event) => set({ renderScale: Number(event.target.value) })}>
            {RENDER_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {scale === 0 ? tr('Match graphics') : `${Math.round(scale * 100)}%`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <T k="Renderer (applies on restart)" />
          <select
            value={settings.backend}
            onChange={(event) => set({ backend: event.target.value as RendererBackendSetting })}
          >
            {BACKENDS.map((backend) => (
              <option key={backend} value={backend}>
                {backend === 'auto' ? tr('Automatic') : backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <T k="Tone mapping" />
          <select value={settings.toneMapping} onChange={(event) => set({ toneMapping: event.target.value as ToneMapSetting })}>
            <option value="agx">{tr('Natural (AgX)')}</option>
            <option value="aces">{tr('Filmic (ACES)')}</option>
          </select>
        </label>
        <label className="field">
          <T k="Mouse sensitivity" />
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.1}
            aria-label={tr('Mouse sensitivity')}
            value={settings.mouseSensitivity}
            onChange={(event) => set({ mouseSensitivity: Number(event.target.value) })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.invertY} onChange={(event) => set({ invertY: event.target.checked })} />
          <T k="Invert Y" />
        </label>
        <label className="field">
          <T k="Autosave" />
          <select
            value={String(settings.autosaveInterval)}
            onChange={(event) => set({ autosaveInterval: Number(event.target.value) })}
          >
            {AUTOSAVE_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? tr('Off') : `${seconds} s`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.showFps} onChange={(event) => set({ showFps: event.target.checked })} />
          <T k="Show FPS" />
        </label>
        <label className="field">
          <T k="UI scale" />
          <input
            type="range"
            min={90}
            max={125}
            step={5}
            aria-label={tr('UI scale')}
            value={Math.round(settings.uiScale * 100)}
            onChange={(event) => set({ uiScale: Number(event.target.value) / 100 })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.continueLast}
            onChange={(event) => set({ continueLast: event.target.checked })}
          />
          <T k="Continue last project" />
        </label>
        {showPlayer && (
          <>
            <label className="field">
              <T k="Player name" />
              <input value={settings.playerName} onChange={(event) => set({ playerName: event.target.value })} />
            </label>
            <label className="field">
              <T k="Colour" />
              <input type="color" value={settings.playerColor} onChange={(event) => set({ playerColor: event.target.value })} />
            </label>
          </>
        )}
    </Modal>
  )
}
