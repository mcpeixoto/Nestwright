# u03 — Pause menu on Escape

**Epic:** UI shell **Release:** v0.16.0 **Owner model:** grok-4.7-medium
**Depends on:** u02
**Time box:** ≤ 20 min of agent work

## Goal
Pressing Escape in the editor with nothing selected and the Select tool active opens a
"Paused" dialog: Resume, Save, Save as…, Open…, New house, Settings, Help, Main menu and
(desktop only) Quit. Escape with a selection still clears it; Escape with another tool
active returns to Select. While the dialog is open no editor shortcut fires.

## Context the implementer needs
- `src/ui/builtinShortcuts.ts` L111–116: the `clear-selection` shortcut (`keys: 'escape'`,
  `run: () => useStore.getState().select([])`). Keep its `id` and `description` unchanged.
- `src/ui/installShortcuts.ts`: dispatch order is help-open Escape → typing guard → walk/photo
  guard → active tool `onKeyDown` → shortcut list. The tour's capture-phase Escape
  (`src/ui/onboarding/Tour.tsx` `bindTourEscape`) runs before all of this and stops propagation.
- `src/ui/ToolRail.tsx` L84–99 closes an open flyout on a document `keydown` Escape; the event
  then reaches the window listener too. Any `[role="menu"]` in the DOM means a flyout or
  dropdown is open and Escape belongs to it.
- `src/ui/Modal.tsx`: portaled dialog, focus trap, Escape and backdrop click call `onClose`,
  focus returns to the opener. `src/ui/settingsDialogState.ts` is the open-state module pattern
  (`isSettingsOpen`, `setSettingsOpen`, `subscribeSettings`).
- Actions: `saveProject`, `saveProjectAs`, `openProject`, `newProject` in `src/ui/actions.ts`;
  `openHome` and `enterEditor` in `src/ui/session.ts`; `setSettingsOpen`; `setHelpPage('shortcuts')`
  (`src/achievements/helpPage.ts`) + `setHelpOpen(true)` (`src/ui/shortcuts.ts`);
  `getPlatform().isElectron` / `getPlatform().quit` (`src/platform`).
- `EditorShell` in `src/ui/App.tsx` is where editor-only chrome mounts (`<Tour />` is last).
- Strings `Save`, `Save As…`, `Open…`, `Settings`, `Help`, `Quit`, `New house` (u02) exist.

## Steps
1. `tests/ui/pauseMenu.test.tsx` (new, jsdom). Import `'../../src/ui/builtinShortcuts'`,
   `listShortcuts` from `src/ui/shortcuts`, `isPauseOpen`/`setPauseOpen` from
   `src/ui/pauseMenuState`, `PauseMenu` from `src/ui/PauseMenu`, `useStore`. Cases:
   - `clear-selection` with `selection: ['w1']` → after `run(event)` selection is `[]` and
     `isPauseOpen()` is false.
   - empty selection, `tool: 'wall'` → tool becomes `'select'`, menu stays closed.
   - empty selection, `tool: 'select'` → `isPauseOpen()` true.
   - with a `<div role="menu">` appended to `document.body`, the same call leaves the menu closed.
   - render `<PauseMenu />`, `setPauseOpen(true)`: a `[role="dialog"][aria-label="Paused"]` exists
     with buttons `Resume`, `Save`, `Save As…`, `Open…`, `New house`, `Settings`, `Help`, `Main menu`
     and no `Quit`; clicking `Resume` closes it; reopening and dispatching Escape on `document`
     closes it (Modal handles the key).
   - Reset `setPauseOpen(false)`, `select([])`, `setTool('select')` in `afterEach`.
2. `src/ui/pauseMenuState.ts` (new): copy `settingsDialogState.ts` with names `isPauseOpen`,
   `setPauseOpen`, `subscribePause`.
3. `src/ui/builtinShortcuts.ts`: replace the `clear-selection` `run` with
   ```ts
   run: () => {
     if (typeof document !== 'undefined' && document.querySelector('[role="menu"]')) return
     const state = useStore.getState()
     if (state.selection.length > 0) { state.select([]); return }
     if (state.tool !== 'select') { state.setTool('select'); return }
     setPauseOpen(true)
   }
   ```
   Import `setPauseOpen` from `./pauseMenuState`. Do not change `description`.
4. `src/ui/installShortcuts.ts`: after the help-open check add
   `if (isPauseOpen()) return` so no tool or shortcut runs while paused (Modal already owns
   Escape and Tab).
5. `src/ui/PauseMenu.tsx` (new): `useSyncExternalStore(subscribePause, isPauseOpen, () => false)`;
   when open render `<Modal className="pause-menu" label={tr('Paused')} onClose={() => setPauseOpen(false)}>`
   with `<h2><T k="Paused" /></h2>` and a `<div className="menu-list">` of `<button type="button">`
   items. Each item calls `setPauseOpen(false)` first, then: Resume nothing; Save
   `void saveProject()`; Save as… `void saveProjectAs()`; Open… `void openProject()`; New house
   `newProject()`; Settings `setSettingsOpen(true)`; Help `setHelpPage('shortcuts'); setHelpOpen(true)`;
   Main menu `openHome()`; Quit (only `getPlatform().isElectron`) `void getPlatform().quit?.()`.
6. `src/ui/App.tsx`: import and render `<PauseMenu />` in `EditorShell` after `<Tour />`.
7. `src/ui/styles.css`: `.pause-menu { width: 320px; } .pause-menu .menu-list { display: flex; flex-direction: column; gap: var(--s2); } .pause-menu .menu-list button { text-align: left; padding: var(--s3) var(--s4); border-radius: var(--r-md); font-size: var(--fs-md); }`.
8. Strings in `en.ts` + `pt.ts`: `Paused` → `Em pausa`; `Resume` → `Continuar`; `Main menu` → `Menu principal`.

## Tests to add
- `tests/ui/pauseMenu.test.tsx` — the six cases above.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green
  (`tests/ui/tourEscape.test.ts` and `tests/ui/tabShortcut.test.ts` must still pass unchanged).
- `npm run dev`: draw a wall, press Escape (selection clears), Escape (back to Select), Escape
  (Paused dialog). With the dialog open, `W` does not change the tool. Resume and Escape both close it.

## Out of scope / forbidden
- Do not edit existing tests or user-facing strings; the shortcut description stays `Clear selection` (u12 renames it).
- Do not change `Modal.tsx` behaviour.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
