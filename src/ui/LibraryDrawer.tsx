import { useEffect, useState, useSyncExternalStore } from 'react'
import { CATEGORIES, listEntries } from '../catalog/registry'
import { getThumb, requestThumb, subscribeThumbs, thumbRevision } from '../catalog/thumbnails'
import { catalogName, categoryName } from '../i18n/catalog'
import { useTranslate } from '../i18n'
import { T } from '../i18n/T'
import { bootImportedModels, catalogIdForAsset, importModelFile, removeImportedModel } from '../io/importModel'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { beginPlace } from '../tools/placeItem'
import { PhotoFurnitureDialog } from './PhotoFurnitureDialog'

function categoryLabel(id: string): string {
  if (id === 'imported') return 'My models'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

const DRAWER_CATEGORIES = [...CATEGORIES.map((id) => ({ id, label: categoryLabel(id) })), { id: 'imported', label: 'My models' }]

export function LibraryDrawer() {
  const language = useSettings((s) => s.language)
  const tr = useTranslate()
  const [category, setCategory] = useState<string>('living')
  const [query, setQuery] = useState('')
  const [photoOpen, setPhotoOpen] = useState(false)
  const revision = useSyncExternalStore(subscribeThumbs, thumbRevision, () => 0)
  const assets = useStore((s) => s.project.assets)
  const needle = query.trim().toLowerCase()
  const entries = listEntries(category).filter((entry) => {
    if (!needle) return true
    const name = catalogName(language, entry.id, entry.name).toLowerCase()
    return name.includes(needle) || entry.name.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.includes(needle))
  })

  const thumbIds = entries.map((entry) => entry.id).join(',')
  useEffect(() => {
    bootImportedModels()
  }, [])

  useEffect(() => {
    for (const id of thumbIds.split(',')) if (id) requestThumb(id, true)
  }, [thumbIds])

  return (
    <aside className="library">
      <input
        className="search"
        placeholder={tr('Search furniture')}
        value={query}
        aria-label={tr('Search furniture')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="button" onClick={() => void importModelFile()}>
        <T k="Import model" />
      </button>
      <button type="button" onClick={() => setPhotoOpen(true)}>
        <T k="From photo…" />
      </button>
      {photoOpen && <PhotoFurnitureDialog onClose={() => setPhotoOpen(false)} />}
      <div className="cats">
        {DRAWER_CATEGORIES.map((item) => (
          <button type="button" key={item.id} className={item.id === category ? 'on' : ''} onClick={() => setCategory(item.id)}>
            {item.id === 'imported' ? tr('My models') : categoryName(language, item.id)}
          </button>
        ))}
      </div>
      <div className="thumbs">
        {entries.map((entry) => {
          const thumb = revision >= 0 ? getThumb(entry.id) : ''
          const name = catalogName(language, entry.id, entry.name)
          const assetId = assets.find((asset) => catalogIdForAsset(asset.id) === entry.id)?.id
          return (
            <div key={entry.id} className="thumb">
              <button type="button" className="thumb-hit" onClick={() => beginPlace(entry.id)}>
                {thumb ? <img src={thumb} alt="" /> : <span className="thumb-fallback">{name.slice(0, 1)}</span>}
                <span>{name}</span>
              </button>
              {assetId && (
                <button type="button" className="thumb-remove" aria-label={tr('Remove {name}', { name })} onClick={() => removeImportedModel(assetId)}>
                  ×
                </button>
              )}
            </div>
          )
        })}
        {entries.length === 0 && (
          <p className="hint">
            <T k="Nothing in this category matches." />
          </p>
        )}
      </div>
    </aside>
  )
}
