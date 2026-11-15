import { useEffect, useSyncExternalStore } from 'react'
import { getPlatform } from '../../platform'
import { TEMPLATES } from '../../templates'
import { planThumb } from '../../templates/thumbnail'
import { cachedThumb, requestLazyThumb, subscribeLazyThumbs, thumbRevision } from './lazyThumbs'
import { getController } from '../../view3d/SceneController'
import { Viewport3D } from '../../view3d/Viewport3D'
import { openProject } from '../actions'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { beginProject, canContinueProject, enterEditor, showBriefs, showGallery, showStart, useScreen } from '../session'
import { BriefsGallery } from './BriefsGallery'
import { loadTemplate } from './loadTemplate'
import { setSettingsOpen } from '../settingsDialogState'
import { coopJoinAvailable, openCoopJoin } from './coop'
import { loadRecent, projectFromRecent, subscribeRecent } from './recent'
import { relativeTime } from './recentList'

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
  const thumbRev = useSyncExternalStore(subscribeLazyThumbs, thumbRevision, thumbRevision)
  useEffect(() => {
    if (screen === 'gallery') {
      for (const item of TEMPLATES) {
        requestLazyThumb(item.id, () => {
          try {
            return planThumb(item.create())
          } catch {
            return ''
          }
        })
      }
      return
    }
    for (const item of recent) {
      if (item.thumb || !item.data) continue
      requestLazyThumb(`recent:${item.id}`, () => {
        const entry = loadRecent().find((row) => row.id === item.id)
        const project = entry ? projectFromRecent(entry) : null
        if (!project) return ''
        try {
          return planThumb(project)
        } catch {
          return ''
        }
      })
    }
  }, [screen, recent])

  const openRecent = (id: string) => {
    const entry = loadRecent().find((item) => item.id === id)
    if (!entry) return
    const project = projectFromRecent(entry)
    if (!project) return
    beginProject(project, entry.path ?? null)
  }

  return (
    <div className="start-host">
      <div className="start-stage">
        <Viewport3D />
        <Orbit />
      </div>
      <div className="start-shade">
        {screen === 'briefs' ? (
          <BriefsGallery />
        ) : screen === 'gallery' ? (
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
                <button type="button" key={item.id} className="gallery-card" onClick={() => loadTemplate(item.id)}>
                  {thumbRev >= 0 && cachedThumb(item.id) ? (
                    <img src={cachedThumb(item.id)} alt="" />
                  ) : (
                    <span className="thumb-fallback" />
                  )}
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
            <div className="start-pair">
              <button type="button" onClick={() => showGallery()}>
                <T k="New project" />
              </button>
              <button type="button" onClick={() => showBriefs()}>
                <T k="House Briefs" />
              </button>
            </div>
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
                {recent.map((item) => {
                  const when = relativeTime(item.updatedAt)
                  const recentThumb = item.thumb || cachedThumb(`recent:${item.id}`)
                  return (
                  <li key={item.id}>
                    <button type="button" onClick={() => openRecent(item.id)} disabled={!item.data}>
                      {thumbRev >= 0 && recentThumb ? <img src={recentThumb} alt="" /> : <span className="thumb-fallback" />}
                      <span className="recent-meta">
                        <span>{item.name === 'Untitled' ? tr('Untitled') : item.name}</span>
                        <span className="hint">{tr(when.key, when.n != null ? { n: when.n } : undefined)}</span>
                      </span>
                    </button>
                  </li>
                  )
                })}
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
