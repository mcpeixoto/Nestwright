# f06 — Kitchen designer UI

**Epic:** Features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** f05, c08 (cabinet family), b03 (per-entity scene diffing)
**Time box:** ≤ 20 min of agent work

## Goal
The player picks the Run tool, drags along a wall and gets a kitchen run of cabinets that fills
the dragged span. The plan shows each module as a labelled box, the 3D view shows carcasses,
fronts, worktop and plinth, and the inspector lists the modules with add / remove / reorder,
a type select, a worktop swatch and a handle style.

## Context the implementer needs
- Model from f05: `src/model/builtins.ts` (`defaultModules`, `fitModules`, `layoutRun`,
  `addModule`, `removeModule`, `moveModule`, `runAt`, `RUN_DEPTH`, `RUN_HEIGHT`), `BuiltinRun`
  in `src/model/types.ts`, `Level.runs`.
- Tool pattern: `src/tools/roomRect.ts` (drag from `onPointerDown` to `onPointerUp`, preview via
  an exported `roomRectPreview()`, `drawOverlay`), `src/tools/registry.ts` `registerTool`,
  `Tool` in `src/tools/types.ts:26` (`group: 'interior'`, `shortcut`, `icon` from `./icons`).
  Shortcut registration: `registerShortcut` as in `src/tools/plot-boundary.ts:74`. Tools are
  side-effect imported from `src/tools/index.ts` — add the new file there.
- Wall hit: `findWallAt(level, point, tolerance)` (`src/model/walls.ts:241`), `locateOnWall`
  (l.124) gives `distance` along the wall and the side sign (`side` or `signed` field — read it).
  `screenTol(zoom, pixels)` in `src/plan2d/snap.ts:88`.
- Plan layers: `registerPlanLayer({ id, order, draw(ctx2d, ctx) })` (`src/plan2d/layers.ts:31`);
  orders: items 30, walls 40. `PlanDrawContext` has `level`, `selection`, `transform.worldToScreen`.
  Look at `src/plan2d/layers/furniture.ts` for how item boxes and labels are drawn.
- Inspector: `registerInspectorSection` (`src/ui/inspector/registry.ts:26`), `patchLevel`
  (`src/ui/inspector/fields.tsx:6`), `MaterialPicker` (`src/ui/MaterialPicker.tsx`), `T`/`useTranslate`.
  Example section with a select and a swatch: `src/ui/inspector/sections/structure.tsx:114–230` (roof).
  `selectionFacts(selection, state)` in `src/ui/inspector/facts.ts` — add a `run` fact.
- 3D: `src/view3d/SceneController.ts` `reconcile()` (the per-level `same` check at ~l.470;
  after b03 it keeps per-entity maps). `src/builders/items.ts` shows a builder returning a
  `THREE.Group` tagged with `userData.entityId`/`kind`. c08 provides the cabinet family at
  `src/catalog/families/cabinet.ts` (read its exports: a function that draws a carcass + front
  for a given module type, width, depth, height, materials, handle). If c08 is not merged yet,
  fall back to exporting `drawModule` from `src/catalog/entries/kitchen.ts:10` and say so.
- Materials: `getMaterial(ref)` from `src/materials/materialCache.ts`.
- Selection: ids in `state.selection`; the select tool's hit test is `entityAt` in
  `src/plan2d/hit.ts:8` — extend it to return a run id when `runAt` hits a run (order: items
  first, then runs, then walls).

## Steps
1. `src/tools/run.ts`: tool `id: 'run'`, label `'Run'`, shortcut `'K'`, group `'interior'`.
   `onPointerDown`: `findWallAt(level, ctx.point, screenTol(zoom, 12))`; if none, status message
   `'Drag along a wall to add a run'` (new string). Store `{ wallId, start: locateOnWall(...).distance, side }`.
   `onPointerMove`: update `end` from `locateOnWall(wall, ctx.point).distance`. `onPointerUp`:
   if `|end - start| >= 0.6`, `apply('Add run', …)` pushing `{ id: newId('run'), kind: 'kitchen',
   wallId, start: min, end: max, side, modules: defaultModules('kitchen', len), front: {id:'oak-planks'},
   worktop: {id:'stone-slate'}, plinth: 0.1, handle: 'bar' }` and `select([id])`. A click
   (no drag) on an existing run selects it. `drawOverlay`: the span as a hatched rectangle of
   depth `RUN_DEPTH.kitchen` using `layoutRun` on a temporary run. Export `runPreview()`.
2. `src/plan2d/layers/runs.ts`: `id: 'runs'`, `order: 32`. For every run of `ctx.level`:
   `layoutRun(run, wall)`; fill each rect `#FFFDF8` (selected: accent stroke `#C8643B`, 2 px),
   stroke `#7A7065` 1 px, draw a 1 px line 50 mm from the front edge (the worktop lip) and the
   module type's short label (`tr(labelOf(type))`) when the zoom shows it ≥ 24 px wide.
   Register the file in `src/plan2d/layers/builtin.ts` (where the other layers are imported).
3. `src/ui/inspector/facts.ts`: `facts.run` = the selected `BuiltinRun` when exactly one id
   matches `level.runs`. `src/ui/inspector/sections/run.tsx`: `id: 'run'`, `order: 31`:
   kind label; module list (one row per module: type `<select>` over `RUN_MODULES[run.kind]`,
   width readout, `↑ ↓ ✕` buttons calling `moveModule`/`removeModule`); `+ Add module`
   button (`addModule(run, 'base-door')`); `MaterialPicker` for `front` and `worktop`
   (worktop only when `kind === 'kitchen'`); handle `<select>` (`bar | knob | groove`); plinth
   `NumberField` 0–0.2. Every edit: `patchLevel(label, draft => { const run = draft.runs?.find(...); if (run) run.modules = fitModules(...).modules })`.
   Register in `src/ui/inspector/sections/index.ts`.
4. `src/builders/runs.ts`: `buildRun(run, wall, level): THREE.Group` tagged
   `userData.entityId = run.id`, `userData.kind = 'run'`. Position each module from
   `layoutRun` (centre, rotation), height `RUN_HEIGHT[run.kind]`, y = `level.elevation`.
   Per module call the c08 cabinet family (carcass + front + handle); `corner` → an L of two
   carcasses; `fridge-tall`/`oven-tower` → full height 2.1. Worktop: one box per contiguous
   base span, `0.04` thick, `20 mm` overhanging the fronts, material `run.worktop`. Plinth: a
   recessed `0.05` box of height `run.plinth` along the span, material `{id:'plaster-white'}`
   tinted `#2B2620`. Filler: a blank panel of `front` material.
5. `src/view3d/SceneController.ts`: include `level.runs` in the per-level diff (b03's map:
   key `run.id`, rebuild when the run object reference or its wall object changes); add
   `bucket.runs` to the `same` check.
6. Strings (en + pt): `'Run'`/`'Bancada'`, `'Add module'`/`'Adicionar módulo'`, `'Worktop'`/`'Tampo'`,
   `'Handle'`/`'Puxador'`, `'Plinth'`/`'Rodapé'`, `'Drag along a wall to add a run'`/`'Arraste ao longo de uma parede para criar uma bancada'`,
   module labels (`'Base door'`/`'Módulo com porta'`, `'Base drawers'`/`'Módulo de gavetas'`,
   `'Sink'`/`'Lava-loiça'`, `'Hob'`/`'Placa'`, `'Oven tower'`/`'Coluna de forno'`,
   `'Tall fridge'` already exists, `'Corner'`/`'Canto'`, `'Dishwasher'`/`'Máquina de lavar loiça'`),
   `'Bar'`/`'Barra'`, `'Knob'`/`'Puxador redondo'`, `'Groove'`/`'Ranhura'`.

## Tests to add
- `tests/plan2d/runLayer.test.ts`: the layer is registered with `order 32` and `draw` on a
  level with one run calls `fillRect`/`fill` at least `modules.length` times on a stub
  `ctx2d` (object with the used methods as `vi.fn()`); nothing is drawn when `level.runs` is empty.
- `tests/builders/runs.test.ts`: `buildRun` of a 3 m kitchen run on wall `(0,0)-(6,0)` returns a
  group whose `Box3` size is `≈ 3.02 × 0.9 × 0.62` (worktop overhang) ±0.03, `userData.kind === 'run'`,
  and every mesh has a geometry with UVs.
- `tests/ui/inspector/runSection.test.tsx` (copy the setup of an existing section test in
  `tests/ui/`): rendering with one selected run shows `modules.length` `<select>`s; clicking
  `Add module` grows `run.modules` by one and the widths still sum to the run length.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/plan2d tests/builders tests/ui tests/i18n` green.
- `npm run build` green.
- Manual, described in the summary: press `k`, drag 3 m along a wall, see the run in plan and
  3D; select it, change a module to `sink`, see the basin in 3D.

## Out of scope / forbidden
- Wardrobe (f07) and vanity (f08) specifics; wall cabinets; island runs.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
