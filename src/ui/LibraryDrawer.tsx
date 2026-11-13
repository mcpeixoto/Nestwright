import { useEffect, useState, useSyncExternalStore } from 'react'
import { CATEGORIES, listEntries } from '../catalog/registry'
import { getThumb, requestThumb, subscribeThumbs, thumbRevision } from '../catalog/thumbnails'
import { beginPlace } from '../tools/placeItem'

export function LibraryDrawer() {
  const [category, setCategory] = useState<string>('living')
  const [query, setQuery] = useState('')
  const revision = useSyncExternalStore(subscribeThumbs, thumbRevision, () => 0)
  const needle = query.trim().toLowerCase()
  const entries = listEntries(category).filter((entry) => {
    if (!needle) return true
    return entry.name.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.includes(needle))
  })

  const thumbIds = entries.map((entry) => entry.id).join(',')
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
      <div className="cats">
        {CATEGORIES.map((item) => (
          <button type="button" key={item} className={item === category ? 'on' : ''} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="thumbs">
        {entries.map((entry) => {
          const thumb = revision >= 0 ? getThumb(entry.id) : ''
          return (
            <button type="button" key={entry.id} className="thumb" onClick={() => beginPlace(entry.id)}>
              {thumb ? <img src={thumb} alt="" /> : <span className="thumb-fallback">{entry.name.slice(0, 1)}</span>}
              <span>{entry.name}</span>
            </button>
          )
        })}
        {entries.length === 0 && <p className="hint">Nothing in this category matches.</p>}
      </div>
    </aside>
  )
}
