# r06 — Door leaf materials and raised panels

**Epic:** realism **Release:** v0.22.0 **Owner model:** grok-4.7-medium
**Depends on:** r03 (`MaterialRef.finish`)
**Time box:** ≤ 20 min of agent work

## Goal
Interior doors stop being a slab of floor planks with invisible panels. A door leaf has
its own choice: `painted` (default: white plaster at satin finish, the panels read through
their shadows) or `wood` (oak planks as today, but the raised panels are a separate mesh
whose grain runs across the leaf). Panels stand 12 mm proud with a 3 mm bevel. The
opening inspector gets a **Leaf** select for doors.

## Context the implementer needs
- `src/builders/openings.ts:115` picks the leaf material
  (`opening.frame.id === 'plaster-white' ? { id: 'oak-planks' } : opening.frame`);
  `buildLeaf` (l.236–266) makes one `Sheet` for wood (slab + panels, l.241/252) and one for
  metal; panels are `chamferBox(wood, panelW, p1 - p0, 0.008, …, 0.0035)`.
- `src/builders/trim.ts:34` `class Sheet { pos, norm, uv, idx; mesh(material) }`;
  `chamferBox(sheet, w, h, d, x, y, z, c)` at l.218. UVs are metres from `Sheet.poly`.
- `src/model/types.ts:59–73` `Opening` (has `frame: MaterialRef`). `src/io/migrate.ts`
  doc comment lists optional fields that load unchanged.
- `src/materials/library.ts` after r03: `PaintFinish`, `MaterialRef.finish`.
- Inspector: `src/ui/inspector/sections/opening.tsx` (`patchLevel('Opening type', …)`
  pattern at l.37; `DOOR_TYPES` from `src/tools/openingTool`). Strings in
  `src/i18n/en.ts`/`pt.ts` (`Leaf` exists at en.ts:923; `Door` at l.42).
- Fixture pattern for tests: `tests/builders/facadeWeathering.test.ts:14–23`
  (`createLevel`, `createWall`, `createOpening('door', wall.id, 2)` from `src/model/defaults`).
- `materialCacheKey` / `getMaterial` from `src/materials/materialCache.ts` to compare materials by identity.

## Steps
1. **Tests first** — `tests/builders/doorLeaf.test.ts` (see below). Fails.
2. `src/model/types.ts`: on `Opening`, `/** Door leaf finish; absent means painted. */ leaf?: 'painted' | 'wood'`.
   `src/io/migrate.ts` comment: "Optional Opening.leaf: absent means painted."
   No `PROJECT_VERSION` bump (optional field, repo convention).
3. `src/builders/openings.ts`: constants
   `export const DOOR_LEAF_PAINT: MaterialRef = { id: 'plaster-white', finish: 'satin' }`,
   `export const DOOR_PANEL_WOOD: MaterialRef = { id: 'oak-planks' }`,
   `export const PANEL_RAISE = 0.012`, `export const PANEL_BEVEL = 0.003`.
   `export function leafMaterials(opening: Opening): { leaf: MaterialRef; panel: MaterialRef }`:
   `wood` → leaf = `opening.frame.id === 'plaster-white' ? { id: 'oak-planks' } : opening.frame`,
   panel = `DOOR_PANEL_WOOD`; otherwise both `DOOR_LEAF_PAINT`.
   Replace l.115 with `const leafRefs = leafMaterials(opening)` and pass
   `getMaterial(leafRefs.leaf)`, `getMaterial(leafRefs.panel)` into `buildLeaf`.
4. `buildLeaf(pivot, leafMat, panelMat, brass, …)`: a third `Sheet` `panels`; panels use
   `chamferBox(panels, panelW, p1 - p0, PANEL_RAISE, cx, y, z + face * (leafD / 2 + PANEL_RAISE / 2), PANEL_BEVEL)`
   so the box sits on the face and stands 12 mm proud (today it is centred on the face).
   After the loop, `rotateUvs(panels)` then `pivot.add(panels.mesh(panelMat))` with
   `userData.doorPanels = true`. Keep the slab in `wood` and the handles in `metal`.
5. `src/builders/trim.ts`: `export function rotateUvs(sheet: Sheet): void` — for every
   pair `(u, v)` in `sheet.uv` write `(v, -u)` (a 90° turn, so plank grain runs across).
6. `src/ui/inspector/sections/opening.tsx`: for `DOOR_TYPES.includes(opening.type)` render
   `<label className="field"><T k="Leaf" /><select value={opening.leaf ?? 'painted'} …>` with
   options `Painted` / `Wood`, writing `found.leaf = value` through `patchLevel('Door leaf', …)`.
7. Strings: `en.ts` `Painted: 'Painted'`, `Wood: 'Wood'`; `pt.ts` `Painted: 'Pintada'`, `Wood: 'Madeira'`.
   (`Leaf` already exists in both: en.ts:923, pt.ts:924 `'Folha'`.)

## Tests to add
`tests/builders/doorLeaf.test.ts`:
- `leafMaterials({ …door, frame: { id: 'plaster-white' } })` → leaf and panel equal
  `DOOR_LEAF_PAINT`; with `leaf: 'wood'` → leaf `{ id: 'oak-planks' }`, panel `DOOR_PANEL_WOOD`;
  with `leaf: 'wood'` and frame `metal-black` → leaf `metal-black`, panel oak.
- Build a `door` opening on a 6 m wall (`createOpening('door', wall.id, 3)`), find the pivot
  (`userData.doorLeaf`): it has exactly 3 meshes; one has `userData.doorPanels`.
- Panel mesh bounding box: `max.z - min.z` is within 1e-4 of `0.04 + 2 * 0.012` (leaf depth
  plus a 12 mm panel each face). Slab box depth is `0.04` ± 1e-4 (chamfer included).
- Panel mesh material `=== getMaterial(DOOR_LEAF_PAINT)` for the default door and
  `=== getMaterial({ id: 'oak-planks' })` for `leaf: 'wood'`.
- `rotateUvs`: a sheet with uv `[0.2, 0.5]` becomes `[0.5, -0.2]`.
- A `double-door` builds two pivots, each with a panel mesh.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/builders tests/i18n tests/model` green.
- `npm run dev`: select a door → Leaf select shows Painted; the leaf is white with panel
  shadows; choose Wood: oak slab with panels whose grain runs horizontally.

## Out of scope / forbidden
- No new door types, no handles change, no leaf thickness change (stays 40 mm).
- Do not edit existing tests. Only `Painted`/`Wood` (and `Leaf` in pt if missing) are new strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not start a dev server for tests. Do not commit, push or merge. No new dependencies.
