# u04 — Save feedback: one toast host, saved state in the top bar

**Epic:** UI shell **Release:** v0.16.0 **Owner model:** grok-4.7-medium
**Depends on:** u01
**Time box:** ≤ 20 min of agent work

## Goal
Saving shows a toast "Saved · 14:02"; autosave shows a short "Autosaved" toast (at most once a
minute); opening a file shows "Opened <name>". The top bar says "Unsaved changes" in words next
to the project name and "Saved ✓" once the file is written. Toasts come from one host in
`src/ui/toast/`, can carry an action button, and the co-op toasts use the same host. The
status-bar text no longer carries save or open feedback.

## Context the implementer needs
- `src/achievements/toast.tsx`: `showToast(text)` (4.2 s timeout) and `ToastHost`. Importers:
  `src/achievements/*`, crash guard, auto graphics tier (grep `showToast`). `App.tsx` mounts
  `<ToastHost />` in `EditorShell`.
- `src/ui/together/chrome.tsx` renders a second `.toast-stack` from `useToasts()` in
  `src/net/live.ts` (`ToastItem { id, text }`, L75–130).
- `src/io/dirty.ts`: `isDirty`, `markSaved`, `subscribeDirty`; `tests/io/dirty.test.ts` asserts
  the dirty flag only (keep that behaviour).
- `src/ui/actions.ts`: `finishSave` L30–34 ends with `say('Saved')`; `openReceivedFile` L97 sets
  the message `Open <file.name>`; `App.tsx` L130–143 autosaves via `saveAutosave(project)`.
- `src/ui/TopBar.tsx` L238: `{dirty && <span className="unsaved-dot" … />}`; `tests/ui/topBar.test.tsx`
  shows how to render `TopBar` in jsdom (matchMedia stub, panel imports).
- `src/ui/StatusBar.tsx` L61 `status-msg` keeps showing `store.message` for other notices.
- Strings: `Saved`, `Unsaved changes`, `Open` exist; new keys go in `en.ts` and `pt.ts`.

## Steps
1. `tests/ui/toastHost.test.tsx` (new, jsdom, fake timers): `showToast('Hi')` renders
   `.toast` text `Hi` inside `[role="status"]`; `showToast('Undo?', { action: { label: 'Undo', run } })`
   renders a `button` named `Undo`, clicking it calls `run` once and removes the toast;
   `showToast('Quick', { duration: 1000 })` is gone after `advanceTimersByTimeAsync(1100)`;
   `dismissToast(id)` removes a toast at once.
2. `tests/ui/saveState.test.tsx` (new, jsdom): `markSaved()` then `getSaveState().savedAt` is a
   number; `saveStateLabel({ dirty: true, savedAt: null })` is `'Unsaved changes'`,
   `({ dirty: false, savedAt: 1 })` is `'Saved ✓'`, `({ dirty: false, savedAt: null })` is `''`;
   `formatClock(new Date(2026, 0, 1, 14, 2).getTime()) === '14:02'`; render `<TopBar />` (copy the
   topBar.test setup), apply a rename → `.save-state` text contains `Unsaved changes`; `markSaved()`
   → contains `Saved ✓`.
3. `src/ui/toast/index.ts` (new): the store from `achievements/toast.tsx` extended to
   `interface ToastOptions { duration?: number; action?: { label: string; run: () => void } }`,
   `showToast(text, options = {}): number` (default duration 4200), `dismissToast(id)`,
   `useToasts()` (`useSyncExternalStore`). `src/ui/toast/ToastHost.tsx` (new): renders
   `<div className="toast-stack" role="status">`; each toast shows text and, when `action` is
   set, `<button type="button" className="toast-action">` that runs it then dismisses. The
   stack root gets `pointer-events: none` and `.toast { pointer-events: auto }` in `styles.css`.
4. `src/achievements/toast.tsx`: replace the body with
   `export { showToast, ToastHost } from '../ui/toast'` plus `export { ToastHost as default }` only
   if something imports a default (grep; probably not). Existing importers keep compiling.
5. `src/ui/together/chrome.tsx`: delete the rendered `.toast-stack`; add a `useEffect` on
   `toasts` that forwards each unseen `ToastItem` (track ids in a `useRef(new Set<number>())`) to
   `showToast(toast.text)`.
6. `src/io/dirty.ts`: add `let savedAt: number | null = null` and
   `export function getSaveState(): { dirty: boolean; savedAt: number | null }`; `markSaved()` sets
   `savedAt = Date.now()` and always `emit()` (even when already clean, so the label updates).
   `subscribeDirty` stays the subscription for both.
7. `src/ui/saveState.ts` (new): `formatClock(ms)` → `HH:MM` 24 h, zero-padded, local time;
   `saveStateLabel(state)` as in step 2 (returns i18n keys; callers translate);
   `useSaveState()` via `useSyncExternalStore(subscribeDirty, getSaveState)`;
   `noteAutosave(): boolean` returns true at most once per 60 000 ms (module timestamp).
8. `src/ui/actions.ts`: `finishSave` → replace `say('Saved')` with
   `showToast(fill(language, 'Saved · {time}', { time: formatClock(Date.now()) }))`; in
   `openReceivedFile` replace the `setMessage(...Open...)` line with
   `showToast(fill(language, 'Opened {name}', { name: file.name }))`. Leave every other `say`.
9. `src/ui/App.tsx` autosave timer: after `saveAutosave(project)` add
   `if (noteAutosave()) showToast(translate(useSettings.getState().language, 'Autosaved'), { duration: 1500 })`.
10. `src/ui/TopBar.tsx`: replace the dot with
    `<span className={dirty ? 'save-state dirty' : 'save-state'} role="status">{label ? tr(label) : ''}</span>`
    where `label = saveStateLabel(useSaveState())`; keep a small `.unsaved-dot::before` glyph via CSS
    on `.save-state.dirty`. Remove the `title=` attribute.
11. `src/ui/styles.css`: `.save-state { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
    .save-state.dirty { color: var(--accent); } .toast-action { margin-left: var(--s3); padding: 2px var(--s2); border: 1px solid var(--line); border-radius: var(--r-sm); }`.
    Drop the old `.unsaved-dot` rule if nothing uses it.
12. Strings `en.ts` + `pt.ts`: `Saved · {time}` → `Guardado · {time}`; `Autosaved` → `Guardado automaticamente`;
    `Opened {name}` → `Aberto {name}`; `Saved ✓` → `Guardado ✓`.

## Tests to add
- `tests/ui/toastHost.test.tsx` — text, action button, duration, dismiss.
- `tests/ui/saveState.test.tsx` — `savedAt`, labels, clock format, top-bar text.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/io tests/i18n tests/achievements tests/electron` green.
- `grep -rn "toast-stack" src/ui/together/chrome.tsx` prints nothing; `grep -rn "say('Saved')" src/ui/actions.ts` prints nothing.
- `npm run dev`: edit → "Unsaved changes" in the bar; ⌘S → toast "Saved · hh:mm" and "Saved ✓"; wait for autosave → "Autosaved" once.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings; only add the four keys above.
- Do not change `net/live.ts` or the achievements logic.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
