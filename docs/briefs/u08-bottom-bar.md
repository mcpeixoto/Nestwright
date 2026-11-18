# u08 — One bottom bar: floors, show, roof, snap, units, areas, daylight

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u05, u06
**Time box:** ≤ 20 min of agent work

## Goal
`LevelBar` and `StatusBar` merge into one `BottomBar`: floor chips with a `+` menu (Above,
Below, Duplicate, Delete, Trace image…), `Show ▾`, a Roof toggle, `Snap ▾` (Grid, Joints,
Angles), the m/ft toggle, the area readout, cursor coordinates, the notice text, and a
`☀ 14:00` chip that opens the Daylight panel. Elevations respect imperial units.

## Context the implementer needs
- `src/ui/LevelBar.tsx`: level buttons each wrapping an `<input>` (rename; `tests/e2e/portuguese.spec.ts`
  L42 reads `.levelbar input`), elevation hard-coded `toFixed(1) m` L40, five action buttons,
  Roof checkbox, Show select. Actions: `addLevelAbove` (`ui/actions.ts`), `addLevelBelow`,
  `duplicateActiveLevel`, `deleteActiveLevel` (already confirms, `levelActions.ts` L96),
  `importTraceImage` (`ui/levelActions.ts`).
- `src/ui/StatusBar.tsx`: coords, Grid/Joints/Angles buttons (`setSnap`), units button (use
  `setUnits` from u05), `.status-area` (`tests/e2e/areas.spec.ts` L32 reads `.statusbar .status-area`),
  plot area, `.status-msg`.
- `src/ui/shortcuts.ts` `TAB_BLOCKED` lists `.levelbar, .statusbar` — keep both class names on
  elements inside the new bar.
- `src/model/units.ts` `formatLength(metres, units)`; `project.environment.time` is hours 0..24
  (`src/model/types.ts` L297); `src/view3d/atmosphere/clock.ts` `clockTime(projectTime)` gives the
  live hour while the sun animation plays, `subscribeClock`/`getClockSnapshot` for subscriptions
  (see `EnvironmentPanel.tsx` imports).
- Daylight panel id `environment` (`panels/EnvironmentPanel.tsx` L305); `togglePanel`, `useOpenPanelIds`.
- `DropMenu` from `src/ui/topbar/DropMenu.tsx` (u06) — items `{ id, label, run, checked? }`.
- `App.tsx` renders `<LevelBar />` then `<StatusBar />` in `EditorShell`.
- Strings `Add level above`, `Add level below`, `Duplicate`, `Delete level`, `Import trace image…`,
  `Roof`, `Show`, `This level`, `This and below`, `All levels`, `Grid`, `Joints`, `Angles`,
  `Metric`, `Imperial`, `Daylight` exist.

## Steps
1. `tests/ui/bottomBar.test.tsx` (new, jsdom): `useStore.getState().setProject(project)` with a
   project of two levels (`createProject` + `insertLevel` from `src/model/levels`, second elevation
   3). Render `<BottomBar />`:
   - `.levelbar .elev` texts are `0 m` and `3 m`; after `setUnits('imperial')` they read `0' 0"` and `9' 10"`.
   - button named `Add level` opens a menu with items `Add level above`, `Add level below`,
     `Duplicate`, `Delete level`, `Import trace image…`.
   - `Snap` menu: item `Grid` has class `on`; clicking it → `useStore.getState().snapGrid === false`.
   - `Roof` button has `aria-pressed="true"`; click → `showRoofs === false`.
   - the daylight chip matches `/^☀ \d{2}:\d{2}$/` and clicking it → `isPanelOpen('environment')` true.
   - `.statusbar .status-msg` shows `useStore.getState().setMessage('Hello')` text.
2. `src/ui/bottomBar/time.ts` (new): `formatHour(hours: number): string` → `HH:MM`, wrapping 24 → `00:00`,
   minutes = `Math.round((hours % 1) * 60)` carried into the hour. Unit-test it in the same file
   as step 1 (`formatHour(14.5) === '14:30'`, `formatHour(23.999) === '00:00'`).
3. `src/ui/BottomBar.tsx` (new): `<footer className="bottombar">` containing
   `<div className="levelbar">` and `<div className="statusbar">`:
   - levelbar: the level chips copied from `LevelBar` (keep the inner `<input aria-label=…>`),
     `.elev` → `formatLength(level.elevation, units)`; then `<DropMenu label={tr('Add level')} icon="plus" …>`
     with the five items (Delete `disabled` when `levels.length <= 1`); then `Show` as a `DropMenu`
     with three `checked` radio-style items; then the Roof `button[aria-pressed]`.
   - statusbar: `.coords`, `Snap` `DropMenu` (Grid/Joints/Angles, `checked` from the store), the
     units button (`setUnits`), `.status-area` (same text as today), plot area, `.status-msg`, and
     last the chip `<button type="button" className={open ? 'chip on' : 'chip'} aria-label={tr('Daylight')} onClick={() => togglePanel('environment')}>☀ {formatHour(hour)}</button>`
     where `hour = useSyncExternalStore(subscribeClock, () => clockTime(time), () => time)` and
     `time = useStore(s => s.project.environment.time)`.
4. `src/ui/App.tsx`: replace `<LevelBar />` and `<StatusBar />` with `<BottomBar />`; delete
   `src/ui/LevelBar.tsx` and `src/ui/StatusBar.tsx` (grep for other importers first; `tests/`
   has none).
5. `src/ui/topbar/DropMenu.tsx`: accept `icon: 'menu' | 'plus'` (renders `☰` or `+`) and
   `align: 'left' | 'right'`; nothing else changes.
6. `src/ui/styles.css`: replace the `.levelbar`/`.statusbar` height rules with
   `.bottombar { display: flex; flex-direction: column; border-top: 1px solid var(--line); background: var(--panel); }
   .bottombar .levelbar, .bottombar .statusbar { display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s3); min-height: 36px; }
   .bottombar .statusbar { font-size: var(--fs-xs); color: var(--muted); }
   .chip { border-radius: 999px; padding: 2px var(--s3); border: 1px solid var(--line); }`.
7. Strings `en.ts` + `pt.ts`: `Add level` → `Adicionar piso`; `Snap` → `Ajuste`.

## Tests to add
- `tests/ui/bottomBar.test.tsx` — the six cases plus `formatHour`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green.
- `grep -rn "LevelBar\|StatusBar" src` prints nothing.
- `npm run test:e2e -- tests/e2e/areas.spec.ts tests/e2e/portuguese.spec.ts` green (selectors kept).
- `npm run dev`: one bar, 36 px rows; the ☀ chip follows the Daylight time slider.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings (`Joints` stays until u12).
- Do not change `levelActions.ts` or the environment panel.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
