import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { Weather } from '../../model/types'
import { plantDensityMultiplier, useSettings, type GraphicsQuality } from '../../settings'
import { useStore } from '../../store'
import { clearLiveTime, clockTime, getClockSnapshot, isTimePlaying, playTime, stopTime, subscribeClock } from '../../view3d/atmosphere/clock'
import { icon } from '../../tools/icons'
import { registerPanel } from './registry'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const PRESETS = [
  { id: 'lisbon', label: 'Lisbon', latitude: 38.72 },
  { id: 'porto', label: 'Porto', latitude: 41.15 },
  { id: 'london', label: 'London', latitude: 51.51 },
  { id: 'new-york', label: 'New York', latitude: 40.71 },
  { id: 'sydney', label: 'Sydney', latitude: -33.87 },
  { id: 'tokyo', label: 'Tokyo', latitude: 35.68 },
  { id: 'reykjavik', label: 'Reykjavík', latitude: 64.15 },
] as const

const WEATHER: { id: Weather; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow' },
  { id: 'fog', label: 'Fog' },
]

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra']

export function formatDayOfYear(day: number): string {
  let left = Math.min(365, Math.max(1, Math.round(day)))
  for (let i = 0; i < MONTH_DAYS.length; i++) {
    const span = MONTH_DAYS[i] ?? 30
    if (left <= span) return `${left} ${MONTHS[i] ?? ''}`
    left -= span
  }
  return '31 Dec'
}

function formatClock(hours: number): string {
  const wrapped = ((hours % 24) + 24) % 24
  const h = Math.floor(wrapped)
  const m = Math.min(59, Math.floor((wrapped - h) * 60))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function patchEnv(label: string, recipe: (env: { dayOfYear: number; time: number; latitude: number; north: number; weather: Weather; cloudiness: number; autoLights: boolean }) => void): void {
  useStore.getState().apply(label, (draft) => {
    recipe(draft.environment)
  })
}

function NorthDial({ radians, onChange }: { radians: number; onChange: (next: number) => void }) {
  const setFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = event.clientY - (box.top + box.height / 2)
    let angle = Math.atan2(dx, -dy)
    if (angle < 0) angle += Math.PI * 2
    onChange(angle)
  }
  return (
    <div
      className="dial"
      role="slider"
      aria-label="North"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round((radians * 180) / Math.PI)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setFromEvent(event)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        setFromEvent(event)
      }}
    >
      <div className="dial-needle" style={{ transform: `rotate(${radians}rad)` }} />
      <span>N</span>
    </div>
  )
}

export function EnvironmentPanel() {
  const env = useStore((s) => s.project.environment)
  const clock = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockSnapshot)
  const quality = useSettings((s) => s.graphicsQuality)
  const playerName = useSettings((s) => s.playerName)
  const playerColor = useSettings((s) => s.playerColor)
  const time = clockTime(env?.time ?? 12)
  const latitude = env?.latitude ?? 41
  const preset = PRESETS.find((item) => Math.abs(item.latitude - latitude) < 0.2)
  const plants = Math.round(plantDensityMultiplier(quality) * 100)

  const commitTime = (hours: number) => {
    stopTime()
    clearLiveTime()
    patchEnv('Time of day', (draft) => {
      draft.time = ((hours % 24) + 24) % 24
    })
  }

  return (
    <div className="props env-panel">
      <h2>Daylight</h2>
      <label className="field">
        <span className="field-label">Date</span>
        <input
          type="range"
          min={1}
          max={365}
          step={1}
          value={env?.dayOfYear ?? 172}
          onChange={(event) => {
            const day = Number(event.target.value)
            patchEnv('Date', (draft) => {
              draft.dayOfYear = day
            })
          }}
        />
        <span className="readout">{formatDayOfYear(env?.dayOfYear ?? 1)}</span>
      </label>
      <label className="field">
        Time
        <div className="time-row">
          <input
            type="range"
            min={0}
            max={24}
            step={0.01}
            value={time}
            onChange={(event) => commitTime(Number(event.target.value))}
          />
          <button
            type="button"
            className={isTimePlaying() ? 'on' : ''}
            aria-label={clock.playing ? 'Pause time' : 'Play time'}
            onClick={() => {
              if (isTimePlaying()) {
                const value = stopTime()
                clearLiveTime()
                if (value != null) {
                  patchEnv('Time of day', (draft) => {
                    draft.time = value
                  })
                }
                return
              }
              playTime(env?.time ?? 12)
            }}
          >
            {clock.playing ? 'Pause' : 'Play'}
          </button>
        </div>
        <span className="readout">{formatClock(time)}</span>
      </label>
      <label className="field">
        Latitude
        <select
          value={preset?.id ?? 'custom'}
          onChange={(event) => {
            const id = event.target.value
            const next = PRESETS.find((item) => item.id === id)
            if (!next) return
            patchEnv('Latitude', (draft) => {
              draft.latitude = next.latitude
            })
          }}
        >
          {PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {!preset && (
          <input
            type="number"
            aria-label="Custom latitude"
            min={-90}
            max={90}
            step={0.1}
            value={latitude}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              patchEnv('Latitude', (draft) => {
                draft.latitude = Math.min(90, Math.max(-90, next))
              })
            }}
          />
        )}
      </label>
      <div className="field">
        North
        <NorthDial
          radians={env?.north ?? 0}
          onChange={(north) => {
            patchEnv('North', (draft) => {
              draft.north = north
            })
          }}
        />
      </div>
      <div className="field">
        Weather
        <div className="weather-row">
          {WEATHER.map((item) => (
            <button
              type="button"
              key={item.id}
              className={env?.weather === item.id ? 'on' : ''}
              onClick={() => {
                patchEnv('Weather', (draft) => {
                  draft.weather = item.id
                })
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Cloudiness
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={env?.cloudiness ?? 0}
          onChange={(event) => {
            const cloudiness = Number(event.target.value)
            patchEnv('Cloudiness', (draft) => {
              draft.cloudiness = cloudiness
            })
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={env?.autoLights !== false}
          onChange={(event) => {
            const autoLights = event.target.checked
            patchEnv('Auto lights', (draft) => {
              draft.autoLights = autoLights
            })
          }}
        />
        Auto lights after sunset
      </label>
      <label className="field">
        Graphics
        <select
          value={quality}
          onChange={(event) => {
            const graphicsQuality = event.target.value as GraphicsQuality
            if (!QUALITIES.includes(graphicsQuality)) return
            useSettings.getState().setSettings({ graphicsQuality })
          }}
        >
          {QUALITIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="readout">Plant density {plants}%</span>
      </label>
      <label className="field">
        Your name
        <input
          value={playerName}
          maxLength={40}
          onChange={(event) => useSettings.getState().setSettings({ playerName: event.target.value })}
        />
      </label>
      <label className="field">
        Your colour
        <input
          type="color"
          aria-label="Your colour"
          value={playerColor || '#3FB8AF'}
          onChange={(event) => useSettings.getState().setSettings({ playerColor: event.target.value })}
        />
      </label>
    </div>
  )
}

registerPanel({
  id: 'environment',
  title: 'Sun',
  placement: 'floating',
  icon: icon('<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'),
  Component: EnvironmentPanel,
})
