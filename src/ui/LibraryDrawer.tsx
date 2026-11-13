import { useEffect, useState, useSyncExternalStore } from 'react'
import { CATEGORIES, listEntries } from '../catalog/registry'
import { getThumb, requestThumb, subscribeThumbs, thumbRevision } from '../catalog/thumbnails'
import { bootImportedModels, catalogIdForAsset, importModelFile, removeImportedModel } from '../io/importModel'
import { useStore } from '../store'
import { beginPlace } from '../tools/placeItem'

const DRAWER_CATEGORIES = [...CATEGORIES.map((id) => ({ id, label: id })), { id: 'imported', label: 'My models' }]

export function LibraryDrawer() {
  const [category, setCategory] = useState<string>('living')
  const [query, setQuery] = useState('')
  const revision = useSyncExternalStore(subscribeThumbs, thumbRevision, () => 0)
  const assets = useStore((s) => s.project.assets)
  const needle = query.trim().toLowerCase()
  const entries = listEntries(category).filter((entry) => {
    if (!needle) return true
    return entry.name.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.includes(needle))
  })

  const thumbIds = entries.map((entry) => entry.id).join(',')
  useEffect(() => {
    bootImportedModels()
  }, [])

  useEffect(() => {
    for (const id of thumbIds.split(',')) if (id) requestThumb(id)
  }, [thumbIds])

  return (
    <aside className="library">
      <input
        className="search"
        placeholder="Search furniture"
        value={query}
        aria-label="Search furniture"
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="button" onClick={() => void importModelFile()}>
        Import model
      </button>
      <div className="cats">
        {DRAWER_CATEGORIES.map((item) => (
          <button type="button" key={item.id} className={item.id === category ? 'on' : ''} onClick={() => setCategory(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="thumbs">
        {entries.map((entry) => {
          const thumb = revision >= 0 ? getThumb(entry.id) : ''
          const assetId = assets.find((asset) => catalogIdForAsset(asset.id) === entry.id)?.id
          return (
            <div key={entry.id} className="thumb">
              <button type="button" className="thumb-hit" onClick={() => beginPlace(entry.id)}>
                {thumb ? <img src={thumb} alt="" /> : <span className="thumb-fallback">{entry.name.slice(0, 1)}</span>}
                <span>{entry.name}</span>
              </button>
              {assetId && (
                <button type="button" className="thumb-remove" aria-label={`Remove ${entry.name}`} onClick={() => removeImportedModel(assetId)}>
                  ×
                </button>
              )}
            </div>
          )
        })}
        {entries.length === 0 && <p className="hint">Nothing in this category matches.</p>}
      </div>
    </aside>
  )
}
