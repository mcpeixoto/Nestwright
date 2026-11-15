import { useState } from 'react'
import { listEntries } from '../../catalog'
import { newId } from '../../model/ids'
import { checkRequirements } from '../../model/requirements'
import type { Wish } from '../../model/types'
import { REACTION_GLYPH, describeTarget, disagreements, groupWishes, targetFromSelection } from '../../model/wishes'
import { getPlanCursor } from '../../plan2d/cursor'
import { getPlanRenderer } from '../../plan2d/PlanRenderer'
import { useSettings } from '../../settings'
import { roomsFor, useStore } from '../../store'
import { T } from '../../i18n/T'
import { fill, translate, useTranslate } from '../../i18n'
import { catalogName, catalogNameById } from '../../i18n/catalog'
import { levelDisplayName, roomDisplayName } from '../../i18n/rooms'
import { registerPanel } from './registry'
import { focusWish } from '../together/focus'
import { setShowWishPins, showWishPins } from '../together/wishView'

function authorName(): string {
  const language = useSettings.getState().language
  return useSettings.getState().playerName.trim() || translate(language, 'Player')
}

/** Model place names that are fixed English words rather than a room's own name. */
const PLACE_WORDS = new Set(['Missing room', 'Not in a room'])

function placeName(language: string, name: string): string {
  return PLACE_WORDS.has(name) ? translate(language, name) : roomDisplayName(language, name)
}

function targetLabel(language: string, project: ReturnType<typeof useStore.getState>['project'], wish: Wish): string {
  const target = wish.target
  if (!target) return translate(language, 'Unknown')
  if (target.kind === 'item') {
    for (const level of project.levels ?? []) {
      const item = level.items.find((entry) => entry.id === target.id)
      if (item) return catalogNameById(language, item.catalogId)
    }
    return translate(language, 'Missing item')
  }
  if (target.kind === 'point') {
    const level = project.levels?.find((item) => item.id === target.levelId)
    return level ? fill(language, 'Point on {name}', { name: levelDisplayName(language, level.name) }) : translate(language, 'Point')
  }
  return placeName(language, describeTarget(project, wish))
}

/** `checkRequirements` details are English model text; the area figures pass through. */
function requirementDetail(language: string, detail: string): string {
  const short = /^(.*), needs (.*) m²$/.exec(detail)
  if (short) return fill(language, '{have}, needs {area} m²', { have: short[1]!, area: short[2]! })
  return translate(language, detail)
}

export function WishesPanel() {
  const tr = useTranslate()
  const language = useSettings((s) => s.language)
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const levelId = useStore((s) => s.activeLevelId)
  const [tab, setTab] = useState<'wishes' | 'disagreements' | 'checklist'>('wishes')
  const [note, setNote] = useState('')
  const [author, setAuthor] = useState('all')
  const [showResolved, setShowResolved] = useState(false)
  const [pins, setPins] = useState(showWishPins())
  const [rule, setRule] = useState<'has-item' | 'min-area'>('has-item')
  const [roomKey, setRoomKey] = useState('')
  const [catalogId, setCatalogId] = useState('')
  const [area, setArea] = useState('10')
  const [reqText, setReqText] = useState('')

  const wishes = project.wishes ?? []
  const authors = [...new Set(wishes.map((wish) => wish.author))]
  const visible = wishes.filter((wish) => (showResolved || !wish.resolved) && (author === 'all' || wish.author === author))
  const groups = groupWishes(project, visible)
  const clashes = disagreements(wishes)
  const rooms = (project.levels ?? []).flatMap((level) =>
    roomsFor(level).map((room) => ({ id: level.id, level: levelDisplayName(language, level.name), room })),
  )
  const catalog = listEntries()
  const requirements = checkRequirements(project)
  const activeLevel = project.levels?.find((level) => level.id === levelId) ?? null
  const activeRooms = activeLevel ? roomsFor(activeLevel) : []

  const react = (reaction: Wish['reaction'], mode: 'selection' | 'point') => {
    const state = useStore.getState()
    const level = state.project.levels?.find((item) => item.id === state.activeLevelId) ?? null
    const found = level ? roomsFor(level) : []
    const cursor = mode === 'point' ? getPlanCursor() : null
    const target = targetFromSelection(level, found, state.selection, cursor, mode)
    if (!target) {
      state.setMessage(mode === 'point' ? tr('Move the pointer on the plan first.') : tr('Select an item, or every wall of a room.'))
      return
    }
    const text = note.trim().slice(0, 280)
    if (reaction === 'idea' && !text) {
      state.setMessage(tr('An idea needs a note.'))
      return
    }
    state.apply(reaction === 'love' ? 'Love' : reaction === 'no' ? 'No' : 'Idea', (draft) => {
      draft.wishes.push({
        id: newId('wish'),
        author: authorName(),
        target,
        reaction,
        note: text,
        createdAt: Date.now(),
      })
    })
    setNote('')
  }

  const addRequirement = () => {
    const key = roomKey || rooms[0]?.room.key
    if (!key) {
      useStore.getState().setMessage(tr('Draw a closed room first.'))
      return
    }
    const chosen = catalog.find((entry) => entry.id === catalogId) ?? catalog[0]
    const min = Number(area)
    if (rule === 'min-area' && (!Number.isFinite(min) || min <= 0)) {
      useStore.getState().setMessage(tr('Enter a minimum area.'))
      return
    }
    if (rule === 'has-item' && !chosen) {
      useStore.getState().setMessage(tr('The catalog is empty.'))
      return
    }
    const text =
      reqText.trim() ||
      (rule === 'min-area'
        ? tr('At least {min} m²', { min })
        : tr('Has {name}', { name: chosen ? catalogName(language, chosen.id, chosen.name) : tr('an item') }))
    useStore.getState().apply('Requirement', (draft) => {
      draft.requirements.push({
        id: newId('req'),
        roomKey: key,
        text,
        rule:
          rule === 'min-area'
            ? { kind: 'min-area', area: min }
            : { kind: 'has-item', catalogId: chosen?.id ?? '' },
      })
    })
    setReqText('')
  }

  return (
    <div className="props together-panel">
      <div className="together-tabs" role="tablist">
        {(['wishes', 'disagreements', 'checklist'] as const).map((id) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {id === 'wishes' ? tr('Board') : id === 'disagreements' ? tr('Clashes {count}', { count: clashes.length }) : tr('Checklist')}
          </button>
        ))}
      </div>
      {tab === 'wishes' && (
        <>
          <label className="field">
            <T k="Note" />
            <input value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="wish-actions">
            <button type="button" onClick={() => react('love', 'selection')}>
              ❤ <T k="selection" />
            </button>
            <button type="button" onClick={() => react('no', 'selection')}>
              ✕ <T k="selection" />
            </button>
            <button type="button" onClick={() => react('idea', 'selection')}>
              💡 <T k="selection" />
            </button>
          </div>
          <div className="wish-actions">
            <button type="button" onClick={() => react('love', 'point')}>
              ❤ <T k="plan point" />
            </button>
            <button type="button" onClick={() => react('no', 'point')}>
              ✕ <T k="plan point" />
            </button>
            <button type="button" onClick={() => react('idea', 'point')}>
              💡 <T k="plan point" />
            </button>
          </div>
          <p className="hint">
            {selection.length > 0
              ? tr('{count} selected on this level ({rooms} rooms).', { count: selection.length, rooms: activeRooms.length })
              : tr('Nothing selected on this level ({rooms} rooms).', { rooms: activeRooms.length })}
          </p>
          <label className="field">
            <T k="Author" />
            <select value={author} aria-label={tr('Author')} onChange={(event) => setAuthor(event.target.value)}>
              <option value="all">{tr('Everyone')}</option>
              {authors.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={pins}
              onChange={(event) => {
                setPins(event.target.checked)
                setShowWishPins(event.target.checked)
                getPlanRenderer()?.requestDraw()
              }}
            />
            <T k="Pins on the plan and in 3D" />
          </label>
          <label className="check">
            <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />
            <T k="Show settled" />
          </label>
          {groups.length === 0 && (
            <p className="hint">
              <T k="No wishes yet. Mark the selection or a point on the plan." />
            </p>
          )}
          {groups.map((group) => (
            <section key={group.key || 'loose'}>
              <h3>{group.key === '' ? tr(group.name) : placeName(language, group.name)}</h3>
              {group.wishes.map((wish) => (
                <div className="wish-row" key={wish.id}>
                  <button type="button" className="link" onClick={() => focusWish(wish)}>
                    {REACTION_GLYPH[wish.reaction]} {targetLabel(language, project, wish)}
                    {wish.note ? ` — ${wish.note}` : ''} <span className="hint">{wish.author}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      useStore.getState().apply('Settle wish', (draft) => {
                        const found = draft.wishes.find((item) => item.id === wish.id)
                        if (found) found.resolved = true
                      })
                    }
                  >
                    <T k="Settle" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      useStore.getState().apply('Delete wish', (draft) => {
                        draft.wishes = draft.wishes.filter((item) => item.id !== wish.id)
                      })
                    }
                  >
                    <T k="Delete" />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      {tab === 'disagreements' && (
        <>
          {clashes.length === 0 && (
            <p className="hint">
              <T k="No clashes. A clash is a love from one of you and a no from the other on the same thing." />
            </p>
          )}
          {clashes.map((clash) => (
            <div className="wish-row" key={clash.key}>
              <button type="button" className="link" onClick={() => clash.loves[0] && focusWish(clash.loves[0])}>
                {clash.loves.map((wish) => wish.author).join(', ')} ❤ · {clash.nos.map((wish) => `${wish.author}${wish.note ? `: ${wish.note}` : ''}`).join(', ')} ✕
              </button>
            </div>
          ))}
        </>
      )}
      {tab === 'checklist' && (
        <>
          {rooms.length === 0 && (
            <p className="hint">
              <T k="Draw a closed room, then add what it must have." />
            </p>
          )}
          <label className="field">
            <T k="Room" />
            <select value={roomKey || rooms[0]?.room.key || ''} onChange={(event) => setRoomKey(event.target.value)}>
              {rooms.map((item) => (
                <option key={`${item.id}:${item.room.key}`} value={item.room.key}>
                  {item.level} · {roomDisplayName(language, item.room.name)}
                </option>
              ))}
            </select>
          </label>
          <div className="together-tabs">
            <button type="button" className={rule === 'has-item' ? 'on' : ''} onClick={() => setRule('has-item')}>
              <T k="Has item" />
            </button>
            <button type="button" className={rule === 'min-area' ? 'on' : ''} onClick={() => setRule('min-area')}>
              <T k="Min area" />
            </button>
          </div>
          {rule === 'has-item' ? (
            <label className="field">
              <T k="Item" />
              <select value={catalogId || catalog[0]?.id || ''} onChange={(event) => setCatalogId(event.target.value)}>
                {catalog.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {catalogName(language, entry.id, entry.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <T k="Minimum m²" />
              <input type="number" aria-label={tr('Minimum m²')} min={0} step={0.5} value={area} onChange={(event) => setArea(event.target.value)} />
            </label>
          )}
          <label className="field">
            <T k="Wording" />
            <input value={reqText} aria-label={tr('Wording')} placeholder={tr('Bath must have a tub')} onChange={(event) => setReqText(event.target.value)} />
          </label>
          <button type="button" onClick={addRequirement} disabled={rooms.length === 0}>
            <T k="Add requirement" />
          </button>
          {requirements.length === 0 && (
            <p className="hint">
              <T k="No requirements yet." />
            </p>
          )}
          {requirements.map((status) => (
            <div className="req-row" key={status.requirement.id}>
              <span aria-label={status.met ? tr('Met') : tr('Unmet')}>{status.met ? '✓' : '✕'}</span>
              <span>
                {placeName(language, status.roomName)}: {status.requirement.text || requirementDetail(language, status.detail)}
              </span>
              <button
                type="button"
                onClick={() =>
                  useStore.getState().apply('Delete requirement', (draft) => {
                    draft.requirements = draft.requirements.filter((item) => item.id !== status.requirement.id)
                  })
                }
              >
                <T k="Delete" />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

registerPanel({
  id: 'wishes',
  title: 'Wishes',
  placement: 'floating',
  Component: WishesPanel,
})
