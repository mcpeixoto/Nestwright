import { useEffect, useState, useSyncExternalStore } from 'react'
import { getPlatform } from '../../platform'
import { planThumb } from '../../templates/thumbnail'
import { T } from '../../i18n/T'
import { useTranslate } from '../../i18n'
import { openProject } from '../actions'
import { setSettingsOpen } from '../settingsDialogState'
import {
  beginBlankProject,
  beginProject,
  canContinueProject,
  enterEditor,
  openCredits,
  showBriefs,
  showGallery,
  useScreen,
} from '../session'
import { coopJoinAvailable, openCoopJoin } from './coop'
import { cachedThumb, requestLazyThumb, subscribeLazyThumbs, thumbRevision } from './lazyThumbs'
import { loadRecent, projectFromRecent, subscribeRecent } from './recent'
import { relativeTime } from './recentList'

function useRecent() {
  return useSyncExternalStore(subscribeRecent, loadRecent, () => [])
}

export function MainMenu() {
  const screen = useScreen()
  const [page, setPage] = useState<'main' | 'new'>('main')
  const recent = useRecent()
  const tr = useTranslate()
  const electron = getPlatform().isElectron
  const join = coopJoinAvailable()
  const thumbRev = useSyncExternalStore(subscribeLazyThumbs, thumbRevision, thumbRevision)
  useEffect(() => {
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
  }, [recent])

  const openRecent = (id: string) => {
    const entry = loadRecent().find((item) => item.id === id)
    if (!entry) return
    const project = projectFromRecent(entry)
    if (!project) return
    beginProject(project, entry.path ?? null)
  }

  if (screen === 'editor') return null

  const mainPage = (
    <>
      <button type="button" className="start-primary" disabled={!canContinueProject()} onClick={() => enterEditor()}>
        <T k="Continue" />
      </button>
      <button type="button" aria-expanded={page === 'new'} onClick={() => setPage('new')}>
        <T k="New house" />
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
      <button type="button" onClick={() => openCredits()}>
        <T k="Credits" />
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
    </>
  )

  return (
    <div className="glass start-panel" role="dialog" aria-label={tr('Nestwright')}>
      <div className="wordmark">Nestwright</div>
      {page === 'new' ? (
        <>
          <div className="menu-head">
            <h1>
              <T k="New house" />
            </h1>
          </div>
          <button type="button" onClick={() => beginBlankProject()}>
            <T k="Blank" />
          </button>
          <button type="button" onClick={() => showGallery()}>
            <T k="From template" />
          </button>
          <button type="button" onClick={() => showBriefs()}>
            <T k="From brief" />
          </button>
          <button type="button" onClick={() => setPage('main')}>
            <T k="Back" />
          </button>
        </>
      ) : (
        mainPage
      )}
    </div>
  )
}
