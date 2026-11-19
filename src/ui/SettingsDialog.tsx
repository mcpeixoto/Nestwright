import { useSyncExternalStore } from 'react'
import { coopJoinAvailable } from './start/coop'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'
import {
  AUTOSAVE_CHOICES,
  resetSettings,
  useSettings,
  type AppLanguage,
  type GraphicsQuality,
  type RendererBackendSetting,
  type ThemeSetting,
  type ToneMapSetting,
} from '../settings'
import { setUnits } from '../settings/units'
import { EV_COMP_MAX, EV_COMP_MIN, formatEv } from '../model/exposure'
import { getPlatform } from '../platform'
import { Modal } from './Modal'
import { confirmIfNeeded } from './confirm'
import {
  isSettingsOpen,
  setSettingsOpen,
  setSettingsTab,
  settingsTab,
  subscribeSettings,
  type SettingsTab,
} from './settingsDialogState'
import { registerTopBarAction } from './topbar/registry'

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']
const BACKENDS: RendererBackendSetting[] = ['auto', 'webgpu', 'webgl']
/** 0 follows the graphics tier. */
const RENDER_SCALES = [0, 0.5, 0.67, 0.8, 1] as const
const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'controls', label: 'Controls' },
  { id: 'sound', label: 'Sound' },
  { id: 'advanced', label: 'Advanced' },
]

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

function ResetDefaults() {
  const tr = useTranslate()
  return (
    <div className="settings-foot">
      <button
        type="button"
        className="danger"
        onClick={() => confirmIfNeeded(tr('Reset all settings to their defaults?'), resetSettings)}
      >
        <T k="Reset to defaults" />
      </button>
    </div>
  )
}

export function SettingsDialog() {
  const open = useSyncExternalStore(subscribeSettings, isSettingsOpen, () => false)
  const tab = useSyncExternalStore(subscribeSettings, settingsTab, () => 'general' as const)
  const settings = useSettings()
  const tr = useTranslate()
  if (!open) return null
  const set = useSettings.getState().setSettings
  const showPlayer = coopJoinAvailable()
  const showPhoto3d = getPlatform().photo3d?.available === true
  return (
    <Modal className="settings-dialog" label={tr('Settings')} onClose={() => setSettingsOpen(false)}>
      <h2>
        <T k="Settings" />
      </h2>
      <div className="modal-switch" role="tablist" aria-label={tr('Settings')}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'on' : ''}
            onClick={() => setSettingsTab(item.id)}
          >
            {tr(item.label)}
          </button>
        ))}
      </div>
      {tab === 'general' ? (
        <div className="settings-page">
          <label className="field">
            <T k="Language" />
            <select value={settings.language} onChange={(event) => set({ language: event.target.value as AppLanguage })}>
              <option value="en">{tr('English')}</option>
              <option value="pt-PT">{tr('Portuguese (Portugal)')}</option>
            </select>
          </label>
          <label className="field">
            <T k="Theme" />
            <select value={settings.theme} onChange={(event) => set({ theme: event.target.value as ThemeSetting })}>
              <option value="cozy">{tr('Cozy')}</option>
              <option value="night">{tr('Night')}</option>
            </select>
          </label>
          <label className="field">
            <T k="Units" />
            <select
              value={settings.units}
              onChange={(event) => setUnits(event.target.value === 'imperial' ? 'imperial' : 'metric')}
            >
              <option value="metric">{tr('Metric')}</option>
              <option value="imperial">{tr('Imperial')}</option>
            </select>
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
            <input
              type="checkbox"
              checked={settings.continueLast}
              onChange={(event) => set({ continueLast: event.target.checked })}
            />
            <T k="Continue last project" />
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
            <span className="readout">{Math.round(settings.uiScale * 100)}%</span>
          </label>
          <ResetDefaults />
        </div>
      ) : null}
      {tab === 'graphics' ? (
        <div className="settings-page">
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
          <label className="check">
            <input type="checkbox" checked={settings.showFps} onChange={(event) => set({ showFps: event.target.checked })} />
            <T k="Show FPS" />
          </label>
          <ResetDefaults />
        </div>
      ) : null}
      {tab === 'controls' ? (
        <div className="settings-page">
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
            <span className="readout">{settings.mouseSensitivity.toFixed(1)}×</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.invertY} onChange={(event) => set({ invertY: event.target.checked })} />
            <T k="Invert Y" />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.railLabels}
              onChange={(event) => set({ railLabels: event.target.checked })}
            />
            <T k="Show tool labels" />
          </label>
          <ResetDefaults />
        </div>
      ) : null}
      {tab === 'sound' ? (
        <div className="settings-page">
          <label className="field">
            <T k="Master volume" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={tr('Master volume')}
              value={settings.volumeMaster}
              onChange={(event) => set({ volumeMaster: Number(event.target.value) })}
            />
            <span className="readout">{settings.volumeMaster}%</span>
          </label>
          <label className="field">
            <T k="Effects volume" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={tr('Effects volume')}
              value={settings.volumeEffects}
              onChange={(event) => set({ volumeEffects: Number(event.target.value) })}
            />
            <span className="readout">{settings.volumeEffects}%</span>
          </label>
          <label className="field">
            <T k="Ambience volume" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label={tr('Ambience volume')}
              value={settings.volumeAmbience}
              onChange={(event) => set({ volumeAmbience: Number(event.target.value) })}
            />
            <span className="readout">{settings.volumeAmbience}%</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.muted} onChange={(event) => set({ muted: event.target.checked })} />
            <T k="Mute" />
          </label>
          <ResetDefaults />
        </div>
      ) : null}
      {tab === 'advanced' ? (
        <div className="settings-page">
          <label className="field">
            <T k="Render scale" />
            <select value={String(settings.renderScale)} onChange={(event) => set({ renderScale: Number(event.target.value) })}>
              {RENDER_SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale === 0 ? tr('Match graphics') : `${Math.round(scale * 100)}%`}
                </option>
              ))}
            </select>
            <span className="hint">
              <T k="Lower values draw fewer pixels and run faster." />
            </span>
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
            <span className="hint">
              <T k="WebGPU is faster where available; WebGL 2 works everywhere." />
            </span>
          </label>
          <label className="field">
            <T k="Tone mapping" />
            <select
              value={settings.toneMapping}
              onChange={(event) => set({ toneMapping: event.target.value as ToneMapSetting })}
            >
              <option value="agx">{tr('Natural (AgX)')}</option>
              <option value="aces">{tr('Filmic (ACES)')}</option>
            </select>
            <span className="hint">
              <T k="How bright colours roll off into white." />
            </span>
          </label>
          <label className="field">
            <T k="Exposure compensation" />
            <input
              type="range"
              min={EV_COMP_MIN}
              max={EV_COMP_MAX}
              step={0.1}
              aria-label={tr('Exposure compensation')}
              value={settings.exposureComp}
              onChange={(event) => set({ exposureComp: Number(event.target.value) })}
            />
            <span className="readout">{formatEv(settings.exposureComp)}</span>
            <span className="hint">
              <T k="Nudges the automatic exposure darker or brighter." />
            </span>
          </label>
          {showPhoto3d && (
            <label className="field">
              <T k="Photo to 3D converter" />
              <input
                type="text"
                spellCheck={false}
                aria-label={tr('Photo to 3D converter')}
                placeholder="/path/to/photo3d.sh"
                value={settings.photo3dCommand}
                onChange={(event) => set({ photo3dCommand: event.target.value })}
              />
              <span className="hint">
                <T k="Full path of the program that turns photos into a 3D model. Empty uses NESTWRIGHT_PHOTO3D." />
              </span>
            </label>
          )}
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
          <ResetDefaults />
        </div>
      ) : null}
    </Modal>
  )
}
