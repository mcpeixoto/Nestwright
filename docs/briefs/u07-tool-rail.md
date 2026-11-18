# u07 — Tool rail: labels on, plain groups, click-to-open, closable panels

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u06
**Time box:** ≤ 20 min of agent work

## Goal
The rail shows a short label under every icon by default. Its items are Select, Build,
Doors & windows, Furniture (opens the Library panel), Paint, Garden, Measure. Flyouts open on
click, never on hover. The Outside panel is no longer a separate rail button (the Garden group
opens it). Every side panel has a close ×. The dead `libraryOpen` store field is gone.

## Context the implementer needs
- `src/ui/ToolRail.tsx`: `GROUPS` L10–16 (`build`, `openings`, `interior`, `outside`, `measure`),
  hover handlers `onMouseEnter`/`onMouseLeave` L187–195, `setLibraryOpen(true)` L208, the
  `rail-panels` block L245–258 (library, outside, budget buttons).
- `src/ui/railDefaults.ts`: `GROUP_DEFAULTS` keyed by the same group ids — keep ids unchanged so
  `tests/ui/railDefaults.test.ts` stays green.
- Tool groups: `src/tools/*.ts` `group:` — build: wall, room-rect, slab, roof, stair, column,
  railing, skylight, balcony, pan, select; openings: door, window; interior: paint, place-item
  (hidden); outside: plot-boundary, terrain-sculpt, ground-paint, path, water, plant-brush, ivy,
  fence; measure: measure, calibrate (hidden).
- `src/settings/index.ts`: `railLabels: false` default, `normalizeSettings` uses `=== true`.
- `src/store/index.ts`: `libraryOpen` / `setLibraryOpen` (only reader: ToolRail L208).
- `src/ui/panels/registry.ts`: `setPanelOpen`, `togglePanel`; `src/ui/panels/PanelSlot.tsx` wraps
  side panels in `<section className="panel-slot">` with no header.
- `src/ui/panels/OutsidePanel.tsx` L258–272 registers `outside` (right, shortcut `o`) and `brush`.
- jsdom pattern: `tests/ui/railFlyoutTooltip.test.tsx`.
- Strings `Select`, `Build`, `Paint`, `Measure`, `Library` exist; new keys go in `en.ts` + `pt.ts`.

## Steps
1. `tests/ui/railLabelsDefault.test.ts` (new): `normalizeSettings({}).railLabels === true`;
   `normalizeSettings({ railLabels: false }).railLabels === false`; `DEFAULT_SETTINGS.railLabels === true`.
2. `tests/ui/panelClose.test.tsx` (new, jsdom): `registerPanel({ id: 'close-me', title: 'Close me', placement: 'right', Component: () => <p>body</p> })`;
   `setPanelOpen('close-me', true)`; render `<PanelSlot panel={def} />`; a button with
   `aria-label="Close Close me"` exists; click → `isPanelOpen('close-me')` false.
3. `tests/ui/railClick.test.tsx` (new, jsdom, copy the setup of railFlyoutTooltip): render the rail;
   `mouseenter` + `mouseover` on the Build group opens no `[role="menu"]`; click opens it; the rail
   has buttons named `Furniture`, `Garden`, `Doors & windows`, `Paint`, `Measure` and none named
   `Outside` or `Library`; clicking `Furniture` → `isPanelOpen('library')` true.
4. `src/settings/index.ts`: `railLabels: true` in `DEFAULT_SETTINGS`;
   normalise as `railLabels: source.railLabels !== false`.
5. `src/store/index.ts`: remove `libraryOpen`, `setLibraryOpen` from the interface, the initial
   state and the actions.
6. `src/ui/ToolRail.tsx`:
   - `GROUPS` → `[{ id: 'build', label: 'Build' }, { id: 'openings', label: 'Doors & windows' }, { id: 'outside', label: 'Garden' }]`.
     Paint and Measure become single `RailButton`s (no flyout): Paint sets tool `paint`,
     Measure sets `measure`; render order Select, Build, Doors & windows, Furniture, Paint, Garden, Measure.
   - Furniture: `RailButton` with `label={tr('Furniture')}`, the library panel's icon
     (`usePanelList().find(p => p.id === 'library')?.icon`), `pressed` = `open.includes('library')`,
     `onClick={() => togglePanel('library')}`, `data-tour="library"`.
   - Delete the `onMouseEnter`/`onMouseLeave` props on `.rail-group`, `hoverGroup` state and
     `suppressHover`; `openGroup = pinnedGroup`. Keep keyboard behaviour (ArrowRight opens, Escape closes).
   - Group click: `if (group.id === 'outside') setPanelOpen('outside', true)`; remove the
     `setLibraryOpen` line.
   - `rail-panels`: filter to `panel.id !== 'outside' && panel.id !== 'library'` (Budget stays).
7. `src/ui/panels/PanelSlot.tsx`: for non-floating panels render
   `<header className="panel-head"><h2>{tr(panel.title)}</h2><button type="button" className="icon-btn" aria-label={tr('Close {name}', { name: tr(panel.title) })} onClick={() => setPanelOpen(panel.id, false)}>×</button></header>`
   before `<panel.Component />`; floating panels get the same × next to `float-title`.
8. `src/ui/styles.css`: `.panel-head h2 { margin: 0; font-size: var(--fs-md); }`;
   `.rail.with-labels .rail-label { font-size: 10px; line-height: 1.1; }`; rail width with labels
   stays 84px.
9. Strings `en.ts` + `pt.ts`: `Doors & windows` → `Portas e janelas`; `Furniture` → `Mobiliário`;
   `Garden` → `Jardim`; `Close {name}` → `Fechar {name}`.

## Tests to add
- `tests/ui/railLabelsDefault.test.ts`, `tests/ui/panelClose.test.tsx`, `tests/ui/railClick.test.tsx`.

## Assertions in pre-existing tests that Claude will update (do not touch them)
- `tests/ui/railFlyoutTooltip.test.tsx` L105 expects the second group to be named `Openings`
  (now `Doors & windows`), and `enterGroup`/`leaveGroup` (L35–41) rely on hover opening a flyout
  (L100–110 and later cases). Both cases need rewriting to click.
- `tests/e2e/portuguese.spec.ts` L48 clicks a button named `Biblioteca`; the rail button is now
  `Mobiliário`. Report these in the summary; leave the files alone.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/settings tests/i18n`: everything
  green except the two `railFlyoutTooltip` cases named above (quote their names in the summary).
- `grep -rn "libraryOpen" src` prints nothing.
- `npm run dev`: labels under icons on first run; hovering a group opens nothing, clicking does;
  Furniture opens the Library with a × in its header.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings (group ids and `Openings`/`Outside` keys stay in en.ts).
- Do not change tool shortcuts or `railDefaults.ts`.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
