# f04 — Copy style / Paste style (eyedropper) for items and walls

**Epic:** features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** none (f03 may create `src/model/style.ts` first; both add distinct exports)
**Time box:** ≤ 20 min of agent work

## Goal
With an item or a wall selected, "Copy style" (alt+C) remembers its materials and tints;
"Paste style" (alt+V) applies them to every selected item or wall in one undo step. An item
gets the slots it shares by name with the source (a sofa's `fabric` onto another sofa, a
chair's `frame` onto a table's `legs` is not attempted); a wall gets both sides.

## Context the implementer needs
- Types: `src/model/types.ts` — `Item.materials: Record<string, MaterialRef>` (182),
  `Wall.left/right: MaterialRef` (38-40), `MaterialRef { id, tint?, scale? }` (18-26).
- Shortcuts: `src/ui/shortcuts.ts:1-9` (`ShortcutDef { id, keys, description, run, when? }`),
  `registerShortcut` (43), `matchesShortcut` (65) already handles `alt` in the chord.
  Built-ins: `src/ui/builtinShortcuts.ts:73-87` (`copy-items` `mod+c`, `paste-items` `mod+v`,
  pattern with `when`). Item clipboard for reference: `src/ui/actions.ts:216-260`
  (`hasItemClipboard`, `copySelection`, `pasteClipboard`).
- Selection: `useStore.getState().selection: string[]` (`src/store/index.ts:78`),
  `selectActiveLevel(state)` (355). Inspector facts: `src/ui/inspector/facts.ts:18`
  `selectionFacts(selection, state)` → `{ items: Item[], walls: Wall[], total }`.
- Inspector sections: `src/ui/inspector/sections/item.tsx` (single item, `patchLevel` from
  `../fields:6`), `wall.tsx` (single wall), `multi.tsx` (several, order 20). Buttons use plain
  `<button type="button">` with `tr('…')` (see `item.tsx:146-156`).
- Every edit goes through one `useStore.getState().apply(label, recipe)`; one call = one undo step.
- Shortcut help lists `description` (`listShortcuts`), so the two descriptions are user-facing strings.

## Steps
1. `tests/model/style.test.ts` (new):
   - `copyStyleFromItem(item)` with `materials { fabric: {id:'velvet-rust', tint:'#aabbcc'}, legs: {id:'metal-black'} }`
     returns `{ kind: 'item', catalogId: 'sofa-3', materials: <deep copy> }` (mutating the item afterwards does not change it).
   - `copyStyleFromWall(wall)` returns `{ kind: 'wall', left, right }` (deep copies).
   - `pasteStyle(level, ['b'], style)` where `b` is another `sofa-3` with `{ fabric, legs }` → both slots
     replaced, including `tint`; a `dining-chair` target `{ seat, frame }` receives nothing from a
     sofa style (no shared slot names) and the function returns `0` for it; a `bed-double`
     `{ linen, frame }` receives `frame` only from a `dining-chair` style `{ seat, frame }`.
   - Pasting a `wall` style onto wall ids sets `left`/`right`; pasting a `wall` style onto item
     ids or an `item` style onto walls changes nothing and returns `0`.
   - `locked` items are skipped. Return value is the number of targets changed.
   - If c10 landed: pasting onto an item with `prop: true` deletes `prop` (call `touchItem`).
2. `src/model/style.ts` (create or extend; pure):
   ```ts
   export type Style =
     | { kind: 'item'; catalogId: string; materials: Record<string, MaterialRef> }
     | { kind: 'wall'; left: MaterialRef; right: MaterialRef }
   export function copyStyleFromItem(item: Item): Style
   export function copyStyleFromWall(wall: Wall): Style
   export function pasteStyle(level: Level, ids: readonly string[], style: Style): number
   ```
   Deep copy with `{ ...ref }` per `MaterialRef`. For items: `for (const slot of Object.keys(target.materials))`
   if `style.materials[slot]` exists, assign a copy; a target with an empty `materials` map (unknown
   catalog id) receives all slots when `catalogId` matches, else nothing.
3. `src/ui/styleClipboard.ts` (new): module state `let clip: Style | null`;
   `export function hasStyle(): boolean`, `copyStyleFromSelection(): boolean` (first selected item
   or wall on the active level; items win when both are selected), `pasteStyleToSelection(): boolean`
   → `useStore.getState().apply('Paste style', (draft) => { const level = draft.levels.find(l => l.id === activeLevelId); if (level && clip) pasteStyle(level, selection, clip) })`
   and returns whether anything was selected. `subscribeStyle(listener)` for buttons to re-render.
4. `src/ui/builtinShortcuts.ts` — after `paste-items` (line 87) register:
   `{ id: 'copy-style', keys: 'alt+c', description: 'Copy style', when: () => selectionHasStyle(), run: () => void copyStyleFromSelection() }`
   and `{ id: 'paste-style', keys: 'alt+v', description: 'Paste style', when: () => hasStyle(), run: () => void pasteStyleToSelection() }`.
   `selectionHasStyle()` = `selectionFacts(selection, state).items.length + walls.length > 0`
   (copy `selectionHasItems()` at `builtinShortcuts.ts:60` and extend it to walls).
   Confirm with `duplicateShortcutChords()` in the test below that `alt+c`/`alt+v` collide with nothing.
5. `src/ui/inspector/sections/item.tsx` and `wall.tsx` — add two buttons after the material pickers:
   `<button type="button" onClick={() => copyStyleFromSelection()}>{tr('Copy style')}</button>` and
   `<button type="button" disabled={!hasStyle()} onClick={() => pasteStyleToSelection()}>{tr('Paste style')}</button>`
   (`useSyncExternalStore(subscribeStyle, hasStyle)` so the disabled state updates).
   `multi.tsx` — the same Paste button only (multi-paste is the main use).
6. `src/i18n/en.ts`: `'Copy style': 'Copy style'`, `'Paste style': 'Paste style'`;
   `pt.ts`: `'Copiar estilo'`, `'Colar estilo'`.

## Tests to add
- `tests/model/style.test.ts` — step 1.
- `tests/ui/styleShortcuts.test.ts` (node): import `'../../src/ui/builtinShortcuts'`; assert
  `listShortcuts().some((s) => s.id === 'copy-style' && s.keys === 'alt+c')`, same for
  `paste-style`/`alt+v`, and `duplicateShortcutChords()` equals `[]`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/ui tests/i18n` green.
- `npx vitest run tests/model/style.test.ts tests/ui/styleShortcuts.test.ts` prints `passed`.
- In the app: select a tinted sofa, alt+C; shift-select three other sofas, alt+V → all recoloured;
  one `mod+z` reverts all three; `?` help dialog lists "Copy style" and "Paste style".

## Out of scope / forbidden
- No OS clipboard, no persistence of the style between sessions.
- Do not edit existing tests or user-facing strings; the two new strings are listed.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
