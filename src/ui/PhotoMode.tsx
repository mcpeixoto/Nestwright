import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { exportViewImage } from '../io/export/images'
import { icon } from '../tools/icons'
import { useStore } from '../store'
import { getController } from '../view3d/SceneController'
import {
  addKeyframe,
  moveKeyframe,
  playFlight,
  recordFlight,
  removeKeyframe,
  setSegmentDuration,
  useFlight,
} from '../view3d/flightPlayback'
import {
  aspectRatio,
  enterPhoto,
  exitPhoto,
  framePixels,
  setPhoto,
  usePhotoSession,
  type PhotoAspect,
  type PhotoResolution,
} from './photoSession'
import { registerTopBarAction } from './topbar/registry'

const ASPECTS: PhotoAspect[] = ['free', '16:9', '4:3', '1:1', '9:16']
const RESOLUTIONS: PhotoResolution[] = ['1080p', '1440p', '4k']

function PhotoButton() {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Photo"
      title="Photo"
      onClick={() => {
        const camera = getController()?.camera
        enterPhoto(camera?.fov ?? null)
      }}
      dangerouslySetInnerHTML={{ __html: icon('<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>') }}
    />
  )
}

registerTopBarAction({ id: 'photo', label: 'Photo', order: 55, Component: PhotoButton })

export function PhotoMode() {
  const photo = usePhotoSession()
  const flight = useFlight()
  const time = useStore((s) => s.project.environment.time)
  const [flash, setFlash] = useState(false)
  const [toast, setToast] = useState(false)

  useEffect(() => {
    const controls = getController()?.controls
    const prev = controls ? { ...controls.mouseButtons } : null
    if (controls) {
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      const camera = getController()?.camera
      if (camera && photo.savedFov != null) {
        camera.fov = photo.savedFov
        camera.updateProjectionMatrix()
      }
      exitPhoto()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (controls && prev) {
        controls.mouseButtons.LEFT = prev.LEFT
        controls.mouseButtons.RIGHT = prev.RIGHT
        controls.mouseButtons.MIDDLE = prev.MIDDLE
      }
    }
  }, [photo.savedFov])

  useEffect(() => {
    const canvas = getController()?.canvas
    if (!canvas) return
    let startX = 0
    let startY = 0
    const onDown = (event: PointerEvent) => {
      startX = event.clientX
      startY = event.clientY
    }
    const onUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) return
      const distance = getController()?.distanceAt(event.clientX, event.clientY)
      if (distance == null) return
      setPhoto({ focus: Math.min(80, Math.max(0.4, distance)) })
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [])

  const setFov = (fov: number) => {
    const camera = getController()?.camera
    if (!camera) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }

  const leave = () => {
    const camera = getController()?.camera
    if (camera && photo.savedFov != null) {
      camera.fov = photo.savedFov
      camera.updateProjectionMatrix()
    }
    exitPhoto()
  }

  const capture = () => {
    const camera = getController()?.camera
    const ratio = aspectRatio(photo.aspect) ?? (camera && camera.aspect > 0.05 ? camera.aspect : 16 / 9)
    const size = framePixels(photo.aspect, photo.resolution, ratio)
    setFlash(true)
    setToast(true)
    window.setTimeout(() => setFlash(false), 140)
    window.setTimeout(() => setToast(false), 1600)
    void exportViewImage(size.width, size.height)
  }

  return (
    <>
      <button type="button" className="photo-exit" aria-label="Exit photo" onClick={leave}>
        ×
      </button>
      <p className="photo-hint">Esc to exit</p>
      {flash && <div className="photo-flash" />}
      {toast && <p className="photo-toast">Saved photo</p>}
      <div className="photo-strip">
      <label>
        FOV
        <input type="range" min={20} max={80} step={1} defaultValue={getController()?.camera.fov ?? 48} onChange={(event) => setFov(Number(event.target.value))} />
      </label>
      <label>
        Focus
        <input type="range" min={0.4} max={40} step={0.1} value={photo.focus} onChange={(event) => setPhoto({ focus: Number(event.target.value) })} />
      </label>
      <label>
        Aperture
        <input type="range" min={0} max={1} step={0.01} value={photo.aperture} onChange={(event) => setPhoto({ aperture: Number(event.target.value) })} />
      </label>
      <label>
        Exposure
        <input type="range" min={0.4} max={2} step={0.01} value={photo.exposure} onChange={(event) => setPhoto({ exposure: Number(event.target.value) })} />
      </label>
      <label>
        Time
        <input
          type="range"
          min={0}
          max={24}
          step={0.05}
          value={time}
          onChange={(event) => {
            const hours = Number(event.target.value)
            useStore.getState().apply('Time of day', (draft) => {
              draft.environment.time = hours
            })
          }}
        />
      </label>
      <label>
        Aspect
        <select value={photo.aspect} onChange={(event) => setPhoto({ aspect: event.target.value as PhotoAspect })}>
          {ASPECTS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label>
        Size
        <select value={photo.resolution} onChange={(event) => setPhoto({ resolution: event.target.value as PhotoResolution })}>
          {RESOLUTIONS.map((item) => (
            <option key={item} value={item}>
              {item === '4k' ? '4K' : item}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={photo.grid} onChange={(event) => setPhoto({ grid: event.target.checked })} />
        Grid
      </label>
      <button type="button" onClick={capture}>
        Capture
      </button>
      <div className="flight-box">
        <button type="button" onClick={() => addKeyframe()}>
          Add keyframe
        </button>
        <button type="button" disabled={flight.poses.length < 2 || flight.playing} onClick={() => void playFlight()}>
          Play
        </button>
        <button type="button" disabled={flight.poses.length < 2 || flight.playing} onClick={() => void recordFlight()}>
          Record video
        </button>
        <ol className="flight-list">
          {flight.poses.map((pose, index) => (
            <li key={`${pose.position[0].toFixed(2)}-${index}`}>
              <span>
                {index + 1} · {pose.position.map((value) => value.toFixed(1)).join(', ')}
              </span>
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveKeyframe(index, -1)}>
                Up
              </button>
              <button type="button" aria-label="Move down" disabled={index === flight.poses.length - 1} onClick={() => moveKeyframe(index, 1)}>
                Down
              </button>
              <button type="button" aria-label="Delete keyframe" onClick={() => removeKeyframe(index)}>
                Delete
              </button>
              {index < flight.poses.length - 1 && (
                <label>
                  s
                  <input
                    type="number"
                    min={0.2}
                    max={60}
                    step={0.1}
                    value={flight.durations[index] ?? 4}
                    onChange={(event) => setSegmentDuration(index, Number(event.target.value))}
                  />
                </label>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
    </>
  )
}

export function FrameGuide() {
  const photo = usePhotoSession()
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0, pw: 0, ph: 0 })
  const ratio = aspectRatio(photo.aspect)

  useEffect(() => {
    if (!photo.photo) return
    const parent = host.current?.parentElement
    if (!parent) return
    const measure = () => {
      const pw = parent.clientWidth
      const ph = parent.clientHeight
      if (pw < 2 || ph < 2 || !ratio) {
        setBox({ x: 0, y: 0, w: pw, h: ph, pw, ph })
        return
      }
      if (pw / ph > ratio) {
        const w = ph * ratio
        setBox({ x: (pw - w) / 2, y: 0, w, h: ph, pw, ph })
      } else {
        const h = pw / ratio
        setBox({ x: 0, y: (ph - h) / 2, w: pw, h, pw, ph })
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [photo.photo, ratio])

  if (!photo.photo) return null
  if (!ratio) return photo.grid ? <div className="photo-grid" /> : null
  const right = Math.max(0, box.pw - box.x - box.w)
  const bottom = Math.max(0, box.ph - box.y - box.h)
  return (
    <div className="frame-host" ref={host}>
      <div className="shade" style={{ left: 0, top: 0, width: box.x, bottom: 0 }} />
      <div className="shade" style={{ right: 0, top: 0, width: right, bottom: 0 }} />
      <div className="shade" style={{ left: box.x, top: 0, width: box.w, height: box.y }} />
      <div className="shade" style={{ left: box.x, bottom: 0, width: box.w, height: bottom }} />
      <div className="frame-guide" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
        {photo.grid && <div className="photo-grid" />}
      </div>
    </div>
  )
}
