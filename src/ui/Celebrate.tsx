import { useEffect, useState, type CSSProperties } from 'react'
import { showToast } from '../achievements/toast'
import { fill } from '../i18n'
import { roomDisplayName } from '../i18n/rooms'
import { useSettings } from '../settings'
import { celebrationPlan, type CelebrationPlan } from './celebratePlan'
import { onCelebrate } from './events'

interface Burst {
  id: number
  plan: CelebrationPlan
}

function reducedNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function toastRoom(names: readonly string[]): void {
  const language = useSettings.getState().language
  const shown = (names.length > 0 ? names : ['Room']).map((name) => roomDisplayName(language, name))
  showToast(fill(language, 'Room complete: {name}', { name: shown.join(', ') }))
}

let burstId = 1

/** Confetti over the unlock toast or the room-complete toast. Never takes a click. */
export function Celebrate() {
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const stop = onCelebrate((event) => {
      if (event.kind === 'room-complete') toastRoom(event.names)
      const plan = celebrationPlan(event.kind, reducedNow())
      if (plan.particles.length === 0) return
      const id = burstId++
      setBursts((prev) => [...prev, { id, plan }])
      const timer = setTimeout(() => {
        timers.delete(timer)
        setBursts((prev) => prev.filter((item) => item.id !== id))
      }, 1200)
      timers.add(timer)
    })
    return () => {
      stop()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  if (bursts.length === 0) return null
  return (
    <div className="celebrate" aria-hidden="true">
      {bursts.map((burst) =>
        burst.plan.particles.map((bit, index) => {
          // The toast stack sits at top: 56px, centred; the burst leaves the toast's middle.
          const style = {
            left: '50%',
            top: '74px',
            background: bit.color,
            animationDuration: `${bit.dur}s`,
            '--dx': `${bit.dx}px`,
            '--dy': `${bit.dy}px`,
            '--rot': `${bit.rot}deg`,
          } as CSSProperties
          return <span key={`${burst.id}-${index}`} className={bit.leaf ? 'celebrate-bit leaf' : 'celebrate-bit'} style={style} />
        }),
      )}
    </div>
  )
}
