# u09 — Inspector cards and unit-aware fields

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** claude
**Depends on:** u06
**Time box:** ≤ 20 min of agent work

## Goal
Each inspector section is a collapsible card titled from its registry `title`; collapsed state
survives reloads. Every numeric field that is a length, an angle or a fraction uses a field that
understands units: `LengthField` (already parses `3,5 m` and `11' 4"`), new `AngleField`
(degrees) and new `PercentField` (0–100 %). With nothing selected a "Rooms" card lists each room
with its area, item count and estimated cost.

## Context the implementer needs
- `src/ui/Inspector.tsx` maps `matchingInspectorSections` to `<section.Component>`; sections live
  in `src/ui/inspector/sections/*.tsx` (16 of them render their own `<h2>` — `grep -n '<h2>'`).
- `src/ui/inspector/fields.tsx`: `NumberField` (commits every keystroke), `LengthField`
  (Enter/blur commit, `min`/`max`/`allowZero`, errors `Not a valid length` / `Doesn’t fit there`).
- `NumberField` call sites — 41 (`grep -rn '<NumberField' src --include='*.tsx' | wc -l`):
  | file | labels | new field |
  |---|---|---|
  | sections/level.tsx | Height, Elevation, Slab | LengthField (Elevation `allowZero`, may be negative → add `min={-50}`) |
  | sections/item.tsx | Width, Depth, Height, Elevation | LengthField; Rotation ° → AngleField (value is `rotation·180/π`, commit converts back) |
  | sections/structure.tsx | Width, Rise, Overhang, Thickness ×2, Size, Top offset | LengthField |
  | sections/wall.tsx | Ivy left, Ivy right (0..1) | PercentField |
  | sections/outside.tsx | Water level, Depth, Height | LengthField; Scale (factor) → PercentField; Rotation ° → AngleField |
  | sections/trace.tsx | Rotation ° → AngleField; Origin X, Origin Y → LengthField (`allowZero`, `min={-1000}`) |
  | inspector/KitchenSection.tsx | Wall height → LengthField |
  | panels/OutsidePanel.tsx | Width, Depth → LengthField; Resolution stays NumberField |
  | sections/params.tsx, sections/floorNumber.tsx | stay NumberField (unitless) |
- Room data: `roomsFor(level)` (`src/store`), `roomNetArea(level, room)` (`src/model/areas.ts`),
  `polygonArea`/point-in-polygon helpers in `src/model/geometry.ts` (confirm the exported name),
  `estimateBudget(project).byRoom` (`src/model/budget.ts` L186, `RoomTotal { key, name, total }`),
  `formatMoney` (`src/model/money.ts`), `roomDisplayName(language, name)` (`src/i18n/rooms.ts`).
- `tests/e2e/portuguese.spec.ts` L43 locates `.inspector .props` containing heading `Divisão` and
  takes its first input — the card root must carry `props` and contain the heading.
- `tests/e2e/exactSizes.spec.ts` L41 reads `.inspector` `getByLabel('Length')` — keep field
  `aria-label`s equal to their labels.

## Steps
1. `tests/ui/fields.test.tsx` (new, jsdom): `AngleField` with `value={45}` shows `45°`; typing `90`
   + Enter commits `90`; `-10` is rejected with the alert `Not a valid angle`; `PercentField` with
   `value={0.35}` shows `35 %`, typing `50` commits `0.5`, `120` is rejected (`Not a valid percentage`);
   `LengthField` with the store project set to imperial shows `3' 3 3/8"` for `1`.
   `InspectorCard`: render with `id="t"`; click the header → `aria-expanded="false"`, body gone,
   `localStorage['nestwright:inspector-collapsed']` is `["t"]`; re-render → still collapsed.
2. `src/ui/inspector/fields.tsx`: add `AngleField({ label, value, onCommit, min = 0, max = 360 })`
   (text input, `inputMode="decimal"`, shows `${trim(value)}°`, parses a number with optional `°`,
   wraps into `[min, max)`, Enter/blur commit, Escape reverts — reuse the `LengthField` state
   machine via a shared `useCommitField` hook) and `PercentField({ label, value, onCommit })`
   (value is a 0..1 fraction, shows `${Math.round(value*100)} %`, accepts `0–100` with optional `%`).
   Errors: new keys `Not a valid angle`, `Not a valid percentage`.
3. Replace the call sites per the table; after the edit `grep -rn '<NumberField' src --include='*.tsx' | wc -l`
   must print `4` (params, floorNumber, OutsidePanel Resolution; count any other unitless one you
   keep and justify it in the PR). Keep each `onCommit` guard (`if (value > 0.2)` etc.).
4. `src/ui/inspector/InspectorCard.tsx` (new): `<section className="props card">` with
   `<h2><button type="button" aria-expanded onClick>{title}</button></h2>` and the children when
   expanded. Collapsed ids in `localStorage['nestwright:inspector-collapsed']` (JSON string array,
   wrapped in try/catch) through a tiny module store `collapsed.ts` (`isCollapsed`, `toggleCollapsed`,
   `subscribeCollapsed`).
5. `src/ui/Inspector.tsx`: wrap each section: `<InspectorCard key id={section.id} title={tr(section.title)}>`.
   Remove the duplicate `<h2>` inside each section component (16 files) and their now-unused
   `className="props"` wrappers become `<div className="card-body">`.
6. `src/ui/inspector/sections/rooms.tsx` (new): section `id: 'rooms'`, `order: 11`, `title: 'Rooms'`,
   `match: (selection, state) => selection.length === 0 && roomsFor(activeLevel).length > 0`.
   Renders a `<ul className="room-list">`; each `<li>` is a button (`select([room.key])`) showing
   `roomDisplayName`, `formatArea(roomNetArea(level, room), units)`, `tr('{n} items', { n })` where
   `n` counts `level.items` whose `position` lies inside the room polygon, and
   `formatMoney(byRoom.find(r => r.key === room.key)?.total ?? 0, estimate.currency)`.
   Memoise `estimateBudget(project)` on `project`. Register it in `sections/index.ts`.
7. `src/ui/styles.css`: `.card h2 button { all: unset; cursor: pointer; display: flex; justify-content: space-between; width: 100%; } .card h2 button::after { content: '▾'; opacity: .6; } .card h2 button[aria-expanded='false']::after { content: '▸'; } .room-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s1); } .room-list button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px var(--s2); text-align: left; }`.
8. Strings `en.ts` + `pt.ts`: `Rooms` → `Divisões`; `{n} items` → `{n} itens`; `Not a valid angle`
   → `Ângulo inválido`; `Not a valid percentage` → `Percentagem inválida`.

## Tests to add
- `tests/ui/fields.test.tsx` — AngleField, PercentField, LengthField imperial, InspectorCard persistence.
- `tests/ui/roomsCard.test.tsx` (new): a 4×4 room with one item inside → the Rooms card lists
  `16 m²` and `1 items` text (use `tr` output; English).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green.
- `npm run test:e2e -- tests/e2e/exactSizes.spec.ts tests/e2e/portuguese.spec.ts tests/e2e/areas.spec.ts` green.
- `npm run dev`: switch to Imperial; the item Width field shows feet and inches; Rotation shows `90°`; collapse a card, reload, still collapsed.

## Out of scope / forbidden
- Do not change what any `onCommit` writes to the model.
- Do not rename section titles (u12).
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
