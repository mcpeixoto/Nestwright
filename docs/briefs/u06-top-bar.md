# u06 — Top bar: seven controls, three menus, one tooltip system

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** claude
**Depends on:** u04, u05
**Time box:** ≤ 20 min of agent work

## Goal
The top bar reads left to right: wordmark, project name, saved state · a segmented
`Plan | 3D | Walk` switch, a `Plan + 3D` split toggle, Undo, Redo · three menus: `Plan ▾`
(Wishes, Variants, House brief, Daylight), `Share ▾` (Together, Photo, Image, Floor plan PDF,
Plan PNG, GLB) and `☰` (New, Open, Save, Save As…, Backup file (JSON), Settings, Help). Seven
top-level controls, no `title=` attributes anywhere in `src/ui`, no Brush button, no Home button
(the pause menu's Main menu replaces it).

## Context the implementer needs
- `src/ui/TopBar.tsx`: `VIEWS` L23–28, `FILE_MENU`/`NARROW_ACTIONS`/`CLAIMED` L19–21,
  `OverflowMenu` L64–118 (menu with outside-click close; `title=` on the ⋯ button), `HistoryButton`,
  `LabeledButton`, `LoosePanelButton` (`title=` on icon buttons), `TopBar` L197–290.
- Registered actions (`src/ui/topbar/registry.ts`): home 0 (`start/home.tsx`), new 10, open 20,
  save 30, export-json 40 (`topbar/builtins.tsx`), export 45 (`topbar/exportMenu.tsx`), together 50
  (`together/TogetherDialog.tsx` L196), photo 55 (`PhotoMode.tsx` L56), settings 70
  (`SettingsDialog.tsx` L35), shortcuts 80 (`HelpDialog.tsx` L122, has `title=`).
- Floating panels: wishes, variants, brief (only with `project.brief`), environment ("Daylight"),
  brush. `togglePanel`, `useOpenPanelIds`, `usePanelList` in `panels/registry.ts`.
- `src/ui/Tooltip.tsx` finds the inner `button` (L25) — generalise to `button, input, [tabindex]`,
  falling back to `firstElementChild`.
- `title=` sites: `grep -rn 'title=' src/ui --include='*.tsx'` (13: TopBar, HelpDialog
  `ShortcutsButton`, `LoosePanelButton`, StatusBar `.status-area`, `sections/level.tsx` readout,
  `fields.tsx` LengthField input, …). Each becomes a `<Tooltip>` or a visible `.hint`.
- Save state (`src/ui/saveState.ts`, u04) and `setUnits` (u05) exist.
- Tests to edit: `tests/ui/topBar.test.tsx`, `tests/e2e/planPdf.spec.ts`.
  `tests/ui/registries.test.ts` tests registry ordering only: **no change**; run it to confirm.

## Steps
1. `tests/ui/topBar.test.tsx` — rewrite the three cases (intentional behaviour change, list in PR body):
   - "shows seven top-level controls": buttons named `Plan`, `3D`, `Walk` inside `[role="group"][aria-label="View"]`;
     a button named `Plan + 3D` with `aria-pressed`; `Undo`, `Redo`; menu buttons `Plan menu`,
     `Share`, `Menu` with `aria-haspopup="menu"`; no button named `More`, `Home`, `Brush`, `Export`.
   - "menus hold the old actions": click `Plan menu` → menuitems `Wishes`, `Variants`, `Daylight`
     (no `House brief` without a brief); click `Share` → `Together`, `Photo`, `Image`, `Floor plan PDF`,
     `Plan PNG`, `GLB`; click `Menu` → `New`, `Open`, `Save`, `Save As…`, `Backup file (JSON)`,
     `Settings`, `Help` — all `role="menuitem"`.
   - "toggles the wishes panel from the Plan menu": open `Plan menu`, click `Wishes` →
     `isPanelOpen('wishes')` true, menu closed (`[role="menu"]` null), reopen → item has class `on`.
   - "has no native tooltips": `document.querySelectorAll('[title]').length === 0` after render.
2. `tests/e2e/planPdf.spec.ts` L35–36 and L82–83: replace the two lines with
   `await page.getByRole('button', { name: 'Share' }).click()` (the `Export` click goes away; the
   `menuitem` click for `Floor plan PDF` stays).
3. `src/ui/topbar/DropMenu.tsx` (new): `DropMenu({ label, icon?, items, align = 'right' })` where
   `items: { id, label, run, checked?, disabled? }[]`. Renders `<div className="menu">` with a
   `tb-btn` trigger (`aria-haspopup="menu"`, `aria-expanded`, `aria-label={label}`, text `label ▾`
   except `☰` when `icon === 'menu'` and `label` is `Menu`) wrapped in `Tooltip`; the popover is
   `div.menu-pop[role=menu]` of `button[role=menuitem]` (class `on` when `checked`). Closes on outside
   `pointerdown`, Escape, and after any item runs. ArrowDown/ArrowUp move focus between items; the
   first item gets focus on open. Export this from the module; u08 and u10 reuse it.
4. `src/ui/TopBar.tsx`: rebuild `TopBar`:
   - left: `wordmark`, project-name input, `<span className="save-state">` from u04.
   - centre: `view-switch` group with `Plan` (`'2d'`), `3D`, `Walk`; then `Plan + 3D` toggle
     (`aria-pressed={view === 'split'}`, click → `setView(view === 'split' ? '2d' : 'split')`); then
     the two `HistoryButton`s.
   - right: `DropMenu` Plan (items from floating panels except `brush`, `brief` only with a brief;
     `checked` = open), `DropMenu` Share (`together`, `photo` from the registry by `run` — give both
     registrations a `run` in addition to their `Component`: `TogetherDialog.tsx` export
     `openTogether()`, `PhotoMode.tsx` export `startPhoto()`; Export items call `exportViewImage(1920, 1080)`,
     open `PlanPdfDialog` (state in TopBar), `exportPlanPng()`, `exportHouseGlb()`), `DropMenu` Menu
     (`new`, `open`, `save`, `save-as` → `saveProjectAs`, `export-json` renamed, `settings` →
     `setSettingsOpen(true)`, `help` → `setHelpPage('shortcuts'); setHelpOpen(true)`).
   - Delete `OverflowMenu`, `LabeledButton`, `LoosePanelButton`, `FILE_MENU`, `NARROW_ACTIONS`,
     `CLAIMED`, the `narrow` media query (the three menus fit at 1280). Keep `HistoryButton`.
5. `src/ui/topbar/exportMenu.tsx`: delete the file and its import in `App.tsx` and
   `tests/ui/topBar.test.tsx`; keep `PlanPdfDialog.tsx`. `src/ui/start/home.tsx`: delete and
   remove the import in `App.tsx`. `topbar/builtins.tsx`: `export-json` label → `Backup file (JSON)`;
   add `registerTopBarAction({ id: 'save-as', label: 'Save As…', order: 35, run: () => void saveProjectAs() })`.
   `SettingsDialog.tsx` and `HelpDialog.tsx`: drop the `registerTopBarAction` blocks and the
   `SettingsButton`/`ShortcutsButton` components (search for other importers first).
6. `src/ui/Tooltip.tsx`: anchor lookup as described in Context. Replace every `title=` in `src/ui`
   with `Tooltip` (buttons, inputs) or move the text into a `.hint` span (static readouts).
7. `src/i18n/en.ts` + `pt.ts`: add `Plan` → `Planta`, `Plan + 3D` → `Planta + 3D`, `Plan menu` →
   `Menu da planta`, `Share` → `Partilhar`, `Menu` → `Menu` (add `Menu` to `SAME_IN_PT` in
   `tests/i18n/coverage.test.ts`), `Backup file (JSON)` → `Ficheiro de cópia (JSON)`. Change the
   `export-json` label key; remove `Export JSON`, `Home`, `More` from both files if
   `grep -rn` finds no other use.
8. `src/ui/styles.css`: `.view-switch button { min-width: 56px; }`, `.topbar .menu-pop { min-width: 200px; }`,
   `.tb-btn .caret { opacity: .6; margin-left: 2px; }`.

## Tests to add
- `tests/ui/topBar.test.tsx` (rewritten as in step 1) and `tests/ui/dropMenu.test.tsx` (new):
  opens on click, closes on outside pointerdown and Escape, ArrowDown moves focus, item run closes it.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green.
- `grep -rn 'title=' src/ui --include='*.tsx' | wc -l` prints `0`.
- `npm run test:e2e -- tests/e2e/planPdf.spec.ts tests/e2e/smoke.spec.ts` green.
- `npm run dev` at a 1280-px window: all seven controls visible, nothing wraps.

## Out of scope / forbidden
- Do not rename Wishes/Variants/Together/Joints etc. (u12). Do not touch the rail or bottom bars.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
