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
import { getEntry } from '../../catalog/registry'
import { registerPanel } from './registry'
import { focusWish } from '../together/focus'
import { setShowWishPins, showWishPins } from '../together/wishView'

function authorName(): string {
  return useSettings.getState().playerName.trim() || 'Player'
}

function targetLabel(project: ReturnType<typeof useStore.getState>['project'], wish: Wish): string {
  const target = wish.target
  if (target && target.kind === 'item') {
    for (const level of project.levels ?? []) {
      const item = level.items.find((entry) => entry.id === target.id)
      if (item) return getEntry(item.catalogId)?.name ?? 'Item'
    }
  }
  return describeTarget(project, wish)
}

export function WishesPanel() {
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
    roomsFor(level).map((room) => ({ id: level.id, level: level.name, room })),
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
      state.setMessage(mode === 'point' ? 'Move the pointer on the plan first.' : 'Select an item, or every wall of a room.')
      return
    }
    const text = note.trim().slice(0, 280)
    if (reaction === 'idea' && !text) {
      state.setMessage('An idea needs a note.')
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
      useStore.getState().setMessage('Draw a closed room first.')
      return
    }
    const chosen = catalog.find((entry) => entry.id === catalogId) ?? catalog[0]
    const min = Number(area)
    if (rule === 'min-area' && (!Number.isFinite(min) || min <= 0)) {
      useStore.getState().setMessage('Enter a minimum area.')
      return
    }
    if (rule === 'has-item' && !chosen) {
      useStore.getState().setMessage('The catalog is empty.')
      return
    }
    const text =
      reqText.trim() ||
      (rule === 'min-area' ? `At least ${min} m²` : `Has ${chosen?.name ?? 'an item'}`)
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
      <h2>Wishes</h2>
      <div className="together-tabs" role="tablist">
        {(['wishes', 'disagreements', 'checklist'] as const).map((id) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {id === 'wishes' ? 'Board' : id === 'disagreements' ? `Clashes ${clashes.length}` : 'Checklist'}
          </button>
        ))}
      </div>
      {tab === 'wishes' && (
        <>
          <label className="field">
            Note
            <input value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="wish-actions">
            <button type="button" onClick={() => react('love', 'selection')}>
              ❤ selection
            </button>
            <button type="button" onClick={() => react('no', 'selection')}>
              ✕ selection
            </button>
            <button type="button" onClick={() => react('idea', 'selection')}>
              💡 selection
            </button>
          </div>
          <div className="wish-actions">
            <button type="button" onClick={() => react('love', 'point')}>
              ❤ plan point
            </button>
            <button type="button" onClick={() => react('no', 'point')}>
              ✕ plan point
            </button>
            <button type="button" onClick={() => react('idea', 'point')}>
              💡 plan point
            </button>
          </div>
          <p className="hint">
            {selection.length > 0 ? `${selection.length} selected` : 'Nothing selected'} on {activeRooms.length} rooms here.
          </p>
          <label className="field">
            Author
            <select value={author} onChange={(event) => setAuthor(event.target.value)}>
              <option value="all">Everyone</option>
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
            Pins on the plan and in 3D
          </label>
          <label className="check">
            <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />
            Show settled
          </label>
          {groups.length === 0 && <p className="hint">No wishes yet. Mark the selection or a point on the plan.</p>}
          {groups.map((group) => (
            <section key={group.key || 'loose'}>
              <h3>{group.name}</h3>
              {group.wishes.map((wish) => (
                <div className="wish-row" key={wish.id}>
                  <button type="button" className="link" onClick={() => focusWish(wish)}>
                    {REACTION_GLYPH[wish.reaction]} {targetLabel(project, wish)}
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
                    Settle
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      useStore.getState().apply('Delete wish', (draft) => {
                        draft.wishes = draft.wishes.filter((item) => item.id !== wish.id)
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      {tab === 'disagreements' && (
        <>
          {clashes.length === 0 && <p className="hint">No clashes. A clash is a ❤ from one of you and a ✕ from the other on the same thing.</p>}
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
          {rooms.length === 0 && <p className="hint">Draw a closed room, then add what it must have.</p>}
          <label className="field">
            Room
            <select value={roomKey || rooms[0]?.room.key || ''} onChange={(event) => setRoomKey(event.target.value)}>
              {rooms.map((item) => (
                <option key={`${item.id}:${item.room.key}`} value={item.room.key}>
                  {item.level} · {item.room.name}
                </option>
              ))}
            </select>
          </label>
          <div className="together-tabs">
            <button type="button" className={rule === 'has-item' ? 'on' : ''} onClick={() => setRule('has-item')}>
              Has item
            </button>
            <button type="button" className={rule === 'min-area' ? 'on' : ''} onClick={() => setRule('min-area')}>
              Min area
            </button>
          </div>
          {rule === 'has-item' ? (
            <label className="field">
              Item
              <select value={catalogId || catalog[0]?.id || ''} onChange={(event) => setCatalogId(event.target.value)}>
                {catalog.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              Minimum m²
              <input type="number" min={0} step={0.5} value={area} onChange={(event) => setArea(event.target.value)} />
            </label>
          )}
          <label className="field">
            Wording
            <input value={reqText} placeholder="Bath must have a tub" onChange={(event) => setReqText(event.target.value)} />
          </label>
          <button type="button" onClick={addRequirement} disabled={rooms.length === 0}>
            Add requirement
          </button>
          {requirements.length === 0 && <p className="hint">No requirements yet.</p>}
          {requirements.map((status) => (
            <div className="req-row" key={status.requirement.id}>
              <span aria-label={status.met ? 'Met' : 'Unmet'}>{status.met ? '✓' : '✕'}</span>
              <span>
                {status.roomName}: {status.requirement.text || status.detail}
              </span>
              <button
                type="button"
                onClick={() =>
                  useStore.getState().apply('Delete requirement', (draft) => {
                    draft.requirements = draft.requirements.filter((item) => item.id !== status.requirement.id)
                  })
                }
              >
                Delete
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
