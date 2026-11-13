import { useEffect, useState, useSyncExternalStore } from 'react'
import { getPlatform } from '../platform'
import { useStore } from '../store'
import { visibleAchievements } from './evaluate'
import { liveFeatures } from './features'
import { useTranslate } from '../i18n'
import { achievementProgress, subscribeAchievements } from './watch'

export function AchievementsPage() {
  const progress = useSyncExternalStore(subscribeAchievements, achievementProgress, achievementProgress)
  const project = useStore((state) => state.project)
  const [player, setPlayer] = useState('')
  const rows = visibleAchievements(liveFeatures(project))
  const unlocked = new Set(progress.unlocked)
  const tr = useTranslate()

  useEffect(() => {
    const steam = getPlatform().steam
    if (!steam) return
    let live = true
    void steam
      .available()
      .then(async (ok) => {
        if (!ok || !live) return
        const name = await steam.playerName()
        if (live && name) setPlayer(name)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="achievements">
      {player ? <p className="readout">{tr('Playing as {name}', { name: player })}</p> : null}
      {rows.length === 0 ? (
        <p className="readout">{tr('No achievements in this build.')}</p>
      ) : (
        <ul className="achieve-list">
          {rows.map((item) => {
            const earned = unlocked.has(item.id)
            return (
              <li key={item.id} className={earned ? 'earned' : ''}>
                <strong>{tr(item.name)}</strong>
                <span>{tr(item.description)}</span>
                <em>{earned ? tr('Unlocked') : tr('Locked')}</em>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
