import { useStore } from '../store'
import { emitCelebrate } from '../ui/events'
import { gainedRooms, historyKind, newRoomNames, sfxForLabel } from './logic'
import { sfx } from './sfx'

/** One subscription for undo, redo, labelled edits, and a room count that grew. */
export function installEditSounds(): () => void {
  return useStore.subscribe((state, prev) => {
    if (state.past === prev.past && state.future === prev.future && state.project === prev.project) return
    try {
      const kind = historyKind(prev, state)
      if (kind === 'undo') sfx('undo')
      else if (kind === 'redo') sfx('redo')
      else if (kind === 'apply') {
        const name = sfxForLabel(state.past[state.past.length - 1]?.label ?? '')
        if (name) sfx(name)
      }
      if ((kind === 'apply' || kind === 'redo') && gainedRooms(prev.project.levels, state.project.levels)) {
        sfx('room-complete')
        emitCelebrate({ kind: 'room-complete', names: newRoomNames(prev.project.levels, state.project.levels) })
      }
    } catch {
      /* sound must not break the edit */
    }
  })
}
