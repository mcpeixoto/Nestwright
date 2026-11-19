import { useEffect, useSyncExternalStore } from 'react'
import { TEMPLATES } from '../../templates'
import { planThumb } from '../../templates/thumbnail'
import { cachedThumb, requestLazyThumb, subscribeLazyThumbs, thumbRevision } from './lazyThumbs'
import { getController } from '../../view3d/SceneController'
import { Viewport3D } from '../../view3d/Viewport3D'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { showStart, useScreen } from '../session'
import { BriefsGallery } from './BriefsGallery'
import { loadTemplate } from './loadTemplate'
import { MainMenu } from './MainMenu'

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
  const tr = useTranslate()
  const thumbRev = useSyncExternalStore(subscribeLazyThumbs, thumbRevision, thumbRevision)
  useEffect(() => {
    if (screen !== 'gallery') return
    for (const item of TEMPLATES) {
      requestLazyThumb(item.id, () => {
        try {
          return planThumb(item.create())
        } catch {
          return ''
        }
      })
    }
  }, [screen])

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
          <MainMenu />
        )}
      </div>
    </div>
  )
}
