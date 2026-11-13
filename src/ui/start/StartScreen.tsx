import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { getPlatform } from '../../platform'
import { TEMPLATES, templateById } from '../../templates'
import { planThumb } from '../../templates/thumbnail'
import { getController } from '../../view3d/SceneController'
import { Viewport3D } from '../../view3d/Viewport3D'
import { openProject } from '../actions'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { beginProject, canContinueProject, enterEditor, showGallery, showStart, useScreen } from '../session'
import { setSettingsOpen } from '../settingsDialogState'
import { coopJoinAvailable, openCoopJoin } from './coop'
import { loadRecent, projectFromRecent, rememberProject, subscribeRecent } from './recent'

function useRecent() {
  return useSyncExternalStore(subscribeRecent, loadRecent, () => [])
}

function Orbit() {
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const controls = getController()?.controls
      if (controls) {
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.35
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      const controls = getController()?.controls
      if (controls) controls.autoRotate = false
    }
  }, [])
  return null
}

export function StartScreen() {
  const screen = useScreen()
  const recent = useRecent()
  const tr = useTranslate()
  const electron = getPlatform().isElectron
  const join = coopJoinAvailable()
  const thumbs = useMemo(() => {
    if (screen !== 'gallery') return {}
    const next: Record<string, string> = {}
    for (const item of TEMPLATES) {
      try {
        next[item.id] = planThumb(item.create())
      } catch {
        next[item.id] = ''
      }
    }
    return next
  }, [screen])

  const openRecent = (id: string) => {
    const entry = loadRecent().find((item) => item.id === id)
    if (!entry) return
    const project = projectFromRecent(entry)
    if (!project) return
    beginProject(project)
  }

  const startTemplate = (id: string) => {
    const info = templateById(id)
    if (!info) return
    let project
    try {
      project = info.create()
    } catch {
      return
    }
    project.name = tr(info.nameKey)
    beginProject(project)
    rememberProject(project, thumbs[id] ?? planThumb(project))
  }

  return (
    <div className="start-host">
      <div className="start-stage">
        <Viewport3D />
        <Orbit />
      </div>
      <div className="start-shade">
        {screen === 'gallery' ? (
          <div className="glass gallery" role="dialog" aria-label={tr('Template gallery')}>
            <div className="gallery-head">
              <h1>
                <T k="Template gallery" />
              </h1>
              <button type="button" onClick={() => showStart()}>
                <T k="Back" />
              </button>
            </div>
            <div className="gallery-grid">
              {TEMPLATES.map((item) => (
                <button type="button" key={item.id} className="gallery-card" onClick={() => startTemplate(item.id)}>
                  {thumbs[item.id] ? <img src={thumbs[item.id]} alt="" /> : <span className="thumb-fallback">{tr(item.nameKey).slice(0, 1)}</span>}
                  <strong>{tr(item.nameKey)}</strong>
                  <span>{tr(item.blurbKey)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass start-panel" role="dialog" aria-label={tr('Nestwright')}>
            <div className="wordmark">Nestwright</div>
            <button type="button" className="start-primary" disabled={!canContinueProject()} onClick={() => enterEditor()}>
              <T k="Continue" />
            </button>
            <button type="button" onClick={() => showGallery()}>
              <T k="New project" />
            </button>
            <button
              type="button"
              onClick={() => {
                void openProject().then((opened) => {
                  if (opened) enterEditor()
                })
              }}
            >
              <T k="Open…" />
            </button>
            <div className="recent-block">
              <h2>
                <T k="Recent" />
              </h2>
              {recent.length === 0 && (
                <p className="hint">
                  <T k="No recent projects" />
                </p>
              )}
              <ul className="recent-list">
                {recent.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => openRecent(item.id)} disabled={!item.data}>
                      {item.thumb ? <img src={item.thumb} alt="" /> : <span className="thumb-fallback">{item.name.slice(0, 1)}</span>}
                      <span>{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {join && (
              <button
                type="button"
                onClick={() => {
                  void openCoopJoin()
                }}
              >
                <T k="Join partner" />
              </button>
            )}
            <button type="button" onClick={() => setSettingsOpen(true)}>
              <T k="Settings" />
            </button>
            {electron && (
              <button
                type="button"
                onClick={() => {
                  void getPlatform().quit?.()
                }}
              >
                <T k="Quit" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
