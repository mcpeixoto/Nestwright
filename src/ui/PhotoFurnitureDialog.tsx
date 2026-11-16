import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../i18n'
import { T } from '../i18n/T'
import { addPhotoFurniture } from '../io/importModel'
import { freeSpot } from '../model/freeSpot'
import { renderTurntable } from '../io/photoPreview'
import { getPlanRenderer } from '../plan2d/PlanRenderer'
import { getPlatform, type Photo3dQuality, type PickedPhoto } from '../platform'
import { PHOTO3D_UNAVAILABLE } from '../platform/types'
import { useSettings } from '../settings'
import { selectActiveLevel, useStore } from '../store'
import { LengthField } from './inspector/fields'
import { Modal } from './Modal'
import {
  DEFAULT_PHOTO_SIZE,
  PHOTO_MAX,
  SIZE_MAX,
  SIZE_MIN,
  mergePhotos,
  nameFromFile,
  placementPoint,
  progressPercent,
  runBlock,
  type PhotoPhase,
  type PhotoSize,
} from './photoFurniture'
import { setSettingsOpen } from './settingsDialogState'

function planView() {
  const renderer = getPlanRenderer()
  const width = renderer?.canvas.clientWidth ?? 0
  const height = renderer?.canvas.clientHeight ?? 0
  if (!renderer || width < 2 || height < 2) return null
  const a = renderer.screenToWorld(0, 0)
  const b = renderer.screenToWorld(width, height)
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) }
}

function newRunId(): string {
  return `p3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Furniture from photos: pick 1–3, type the real size, run the local converter, preview, place. */
export function PhotoFurnitureDialog({ onClose }: { onClose: () => void }) {
  const tr = useTranslate()
  const command = useSettings((s) => s.photo3dCommand)
  // getPlatform() builds a new object per call; keep one for the dialog's life so effects stay put.
  const [api] = useState(() => getPlatform().photo3d ?? PHOTO3D_UNAVAILABLE)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [size, setSize] = useState<PhotoSize>(DEFAULT_PHOTO_SIZE)
  const [quality, setQuality] = useState<Photo3dQuality>('fast')
  const [phase, setPhase] = useState<PhotoPhase>('pick')
  const [progress, setProgress] = useState({ value: 0, stage: '' })
  const [error, setError] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [frames, setFrames] = useState<string[]>([])
  const [frame, setFrame] = useState(0)
  const runId = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    void api.configured(command).then(
      (ok) => live && setConfigured(ok),
      () => live && setConfigured(false),
    )
    return () => {
      live = false
    }
  }, [api, command])

  useEffect(
    () =>
      api.onProgress((update) => {
        if (update.runId !== runId.current) return
        setProgress({ value: update.value, stage: update.stage })
      }),
    [api],
  )

  // Closing the dialog mid-run stops the converter.
  useEffect(
    () => () => {
      if (runId.current) void api.cancel(runId.current)
    },
    [api],
  )

  useEffect(() => {
    if (!model) return
    let live = true
    renderTurntable(model, size).then(
      (rendered) => {
        if (!live) return
        setFrames(rendered)
        setFrame(0)
      },
      () => {
        if (!live) return
        setFrames([])
        setPhase('error')
        setError(tr('The converter made a file that is not a 3D model.'))
      },
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render only for a new model or size
  }, [model, size.w, size.d, size.h])

  useEffect(() => {
    if (frames.length < 2) return
    const timer = setInterval(() => setFrame((index) => (index + 1) % frames.length), 90)
    return () => clearInterval(timer)
  }, [frames])

  const pick = async () => {
    const picked = await api.pick()
    if (!picked) return
    const next = mergePhotos(photos, picked.photos)
    setPhotos(next)
    if (!nameTouched && next[0]) setName(nameFromFile(next[0].name))
    if (phase !== 'running') {
      setPhase('pick')
      setModel(null)
      setFrames([])
    }
  }

  const removePhoto = (filePath: string) => {
    setPhotos((list) => list.filter((photo) => photo.path !== filePath))
  }

  const run = async () => {
    const id = newRunId()
    runId.current = id
    setPhase('running')
    setError('')
    setModel(null)
    setFrames([])
    setProgress({ value: 0, stage: '' })
    const result = await api.run({ runId: id, command, images: photos.map((photo) => photo.path), quality })
    if (runId.current !== id) return
    runId.current = null
    if (result.ok) {
      setModel(result.data)
      setPhase('ready')
      return
    }
    if (result.cancelled) {
      setPhase('pick')
      return
    }
    setError(tr('Could not make the 3D model: {error}', { error: result.error }))
    setPhase('error')
  }

  const cancel = () => {
    if (runId.current) void api.cancel(runId.current)
  }

  const addToHouse = () => {
    if (!model) return
    const state = useStore.getState()
    const level = selectActiveLevel(state)
    if (!level) return
    // In the room under the view, clear of walls and other furniture, facing into the room.
    const spot = freeSpot(level, placementPoint(planView(), level.walls), size)
    const placed = addPhotoFurniture({
      name,
      data: model,
      size,
      levelId: level.id,
      position: spot.position,
      rotation: spot.rotation,
    })
    if (!placed) return
    useStore.getState().select([placed.itemId])
    onClose()
  }

  const block = runBlock({ available: api.available, configured: configured !== false, photos: photos.length, size, phase })
  const setSide = (key: keyof PhotoSize) => (metres: number) => {
    setSize((current) => ({ ...current, [key]: metres }))
  }

  return (
    <Modal className="photo-furniture" label={tr('Furniture from photo')} onClose={onClose}>
      <h2>
        <T k="Furniture from photo" />
      </h2>
      {!api.available ? (
        <p className="hint">
          <T k="Making a 3D model from photos only works in the desktop app." />
        </p>
      ) : (
        <>
          <p className="hint">
            <T k="Use 1 to 3 photos of the same piece, from different sides." />
          </p>
          <div className="photo-picks">
            {photos.map((photo) => (
              <div key={photo.path} className="photo-pick">
                {photo.preview ? <img src={photo.preview} alt={photo.name} /> : <span className="thumb-fallback">{photo.name.slice(0, 1)}</span>}
                <button
                  type="button"
                  className="thumb-remove"
                  aria-label={tr('Remove {name}', { name: photo.name })}
                  disabled={phase === 'running'}
                  onClick={() => removePhoto(photo.path)}
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < PHOTO_MAX && (
              <button type="button" disabled={phase === 'running'} onClick={() => void pick()}>
                <T k="Choose photos…" />
              </button>
            )}
          </div>
          <label className="field">
            <T k="Name" />
            <input
              value={name}
              aria-label={tr('Name')}
              onChange={(event) => {
                setName(event.target.value)
                setNameTouched(true)
              }}
            />
          </label>
          <p className="field-label">
            <T k="Real size" />
          </p>
          <div className="photo-size">
            <LengthField label="Width" value={size.w} min={SIZE_MIN} max={SIZE_MAX} onCommit={setSide('w')} />
            <LengthField label="Depth" value={size.d} min={SIZE_MIN} max={SIZE_MAX} onCommit={setSide('d')} />
            <LengthField label="Height" value={size.h} min={SIZE_MIN} max={SIZE_MAX} onCommit={setSide('h')} />
          </div>
          <div className="modal-switch" role="group" aria-label={tr('Model quality')}>
            <button type="button" className={quality === 'fast' ? 'on' : ''} disabled={phase === 'running'} onClick={() => setQuality('fast')}>
              <T k="Fast" />
            </button>
            <button type="button" className={quality === 'best' ? 'on' : ''} disabled={phase === 'running'} onClick={() => setQuality('best')}>
              <T k="Best" />
            </button>
          </div>

          {block === 'no-converter' ? (
            <div className="photo-missing">
              <p className="hint">
                <T k="No photo to 3D converter is set up." />
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  setSettingsOpen(true)
                }}
              >
                <T k="Open Settings" />
              </button>
            </div>
          ) : phase === 'running' ? (
            <div className="photo-progress">
              <progress max={100} value={progressPercent(progress.value)} aria-label={tr('Making the 3D model')} />
              <span className="readout">
                {progressPercent(progress.value)}% · {progress.stage || tr('Starting…')}
              </span>
              <button type="button" onClick={cancel}>
                <T k="Cancel" />
              </button>
            </div>
          ) : (
            <button type="button" disabled={block !== null} onClick={() => void run()}>
              {phase === 'error' || phase === 'ready' ? <T k="Make it again" /> : <T k="Make 3D model" />}
            </button>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          {phase === 'ready' && model && (
            <div className="photo-result">
              {frames.length > 0 ? (
                <img className="photo-preview" src={frames[frame] ?? frames[0]} alt={tr('Preview of the 3D model')} />
              ) : (
                <p className="hint">
                  <T k="The 3D model is ready." />
                </p>
              )}
              <button type="button" className="on" onClick={addToHouse}>
                <T k="Add to house" />
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
