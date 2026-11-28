import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { modelFor, modelsRevision, subscribeModels } from '../catalog/models'
import { CATEGORIES, getEntry, listEntries } from '../catalog/registry'
import { forgetThumb, getThumb, requestThumb, subscribeThumbs, thumbRevision } from '../catalog/thumbnails'
import type { CatalogEntry } from '../catalog/types'
import { catalogName, categoryName } from '../i18n/catalog'
import { useTranslate } from '../i18n'
import { T } from '../i18n/T'
import { bootImportedModels, catalogIdForAsset, importModelFile, removeImportedModel } from '../io/importModel'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { beginPlace } from '../tools/placeItem'
import { CATEGORY_ICONS } from './library/icons'
import { noteRecent, setCardSize, toggleFavourite, useLibraryPrefs } from './library/prefs'
import { searchEntries } from './library/search'
import { PhotoFurnitureDialog } from './PhotoFurnitureDialog'
import { Tooltip } from './Tooltip'
import { DropMenu } from './topbar/DropMenu'

const TABS = ['favourites', 'recent', ...CATEGORIES, 'imported']

const SPECIAL_LABELS: Record<string, string> = { favourites: 'Favourites', recent: 'Recently used', imported: 'My models' }

function known(entry: CatalogEntry | undefined): entry is CatalogEntry {
  return !!entry
}

export function LibraryDrawer() {
  const language = useSettings((s) => s.language)
  const tr = useTranslate()
  const prefs = useLibraryPrefs()
  const [category, setCategory] = useState<string>('living')
  const [query, setQuery] = useState('')
  const [photoOpen, setPhotoOpen] = useState(false)
  const revision = useSyncExternalStore(subscribeThumbs, thumbRevision, () => 0)
  const modelsRev = useSyncExternalStore(subscribeModels, modelsRevision, () => 0)
  const assets = useStore((s) => s.project.assets)
  const needle = query.trim().toLowerCase()

  const tabLabel = (id: string) => (SPECIAL_LABELS[id] ? tr(SPECIAL_LABELS[id]) : categoryName(language, id))
  const special = category === 'favourites' ? prefs.favourites : category === 'recent' ? prefs.recent : null
  const base = special && !needle ? special.map((id) => getEntry(id)).filter(known).map((e) => ({ ...e, category })) : listEntries()
  const entries = searchEntries(base, category, needle, language)

  const thumbIds = entries.map((entry) => entry.id).join(',')
  useEffect(() => {
    bootImportedModels()
  }, [])

  useEffect(() => {
    for (const id of thumbIds.split(',')) if (id) requestThumb(id, true)
  }, [thumbIds])

  // A scanned model that arrives after its procedural thumbnail was drawn: redraw it once.
  const rescanned = useRef(new Set<string>())
  useEffect(() => {
    for (const id of thumbIds.split(',')) {
      if (!id || rescanned.current.has(id) || !modelFor(id)) continue
      rescanned.current.add(id)
      forgetThumb(id)
      requestThumb(id, true)
    }
  }, [thumbIds, modelsRev])

  const large = prefs.cardSize === 'large'
  return (
    <aside className="library">
      <input
        className="search"
        placeholder={tr('Search furniture')}
        value={query}
        aria-label={tr('Search furniture')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="library-head">
        <DropMenu
          label="Add your own"
          align="left"
          items={[
            { id: 'import', label: 'Import model', run: () => void importModelFile() },
            { id: 'photo', label: 'From photo…', run: () => setPhotoOpen(true) },
          ]}
        />
        <Tooltip label={tr('Large cards')}>
          <button
            type="button"
            className={large ? 'size-toggle on' : 'size-toggle'}
            aria-pressed={large}
            aria-label={tr('Large cards')}
            onClick={() => setCardSize(large ? 'small' : 'large')}
          >
            {large ? '▦' : '▢'}
          </button>
        </Tooltip>
      </div>
      {photoOpen && <PhotoFurnitureDialog onClose={() => setPhotoOpen(false)} />}
      <div className="cats">
        {TABS.map((id) => {
          const label = tabLabel(id)
          return (
            <Tooltip key={id} label={label}>
              <button
                type="button"
                className={id === category ? 'cat on' : 'cat'}
                aria-label={label}
                aria-pressed={id === category}
                onClick={() => setCategory(id)}
                dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[id] ?? '' }}
              />
            </Tooltip>
          )
        })}
      </div>
      <div className={large ? 'thumbs large' : 'thumbs small'}>
        {entries.map((entry) => {
          const thumb = revision >= 0 ? getThumb(entry.id) : ''
          const name = catalogName(language, entry.id, entry.name)
          const assetId = assets.find((asset) => catalogIdForAsset(asset.id) === entry.id)?.id
          const favourite = prefs.favourites.includes(entry.id)
          return (
            <div key={entry.id} className="thumb">
              <button
                type="button"
                className="thumb-hit"
                onClick={() => {
                  noteRecent(entry.id)
                  beginPlace(entry.id)
                }}
              >
                {thumb ? <img src={thumb} alt="" /> : <span className="thumb-fallback">{name.slice(0, 1)}</span>}
                <span>{name}</span>
                {needle && <span className="cat-badge">{tabLabel(entry.category)}</span>}
              </button>
              <button
                type="button"
                className={favourite ? 'fav on' : 'fav'}
                aria-pressed={favourite}
                aria-label={tr('Favourite {name}', { name })}
                onClick={() => toggleFavourite(entry.id)}
              >
                {favourite ? '★' : '☆'}
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
            {category === 'favourites' && !needle ? <T k="No favourites yet. Press the star on a piece." /> : <T k="Nothing in this category matches." />}
          </p>
        )}
      </div>
    </aside>
  )
}
