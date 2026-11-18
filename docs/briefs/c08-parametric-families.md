# c08 — Parametric families: cabinet, shelf unit, bed, sofa generators

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** none (c04, c05, c06, c07 depend on this brief: run it first)
**Time box:** ≤ 20 min of agent work

## Goal
Four reusable geometry generators live in `src/catalog/families/`. New entries (c04–c07) call
them instead of hand-placing boxes, so a cabinet with 3 doors, a bed with an upholstered
headboard or a 4-seat sofa is one function call that always fills `ctx.size`. Existing entries
are not changed.

## Context the implementer needs
- `src/catalog/parts.ts` — helpers: `roundedBox(parent, mat, slot, w, h, d, x, y, z, radius=0.008)`
  (line 25), `cylinder(parent, mat, slot, radius, length, x, y, z, axis='y', segments=12)` (48),
  `fourLegs(parent, mat, slot, w, d, height, radius=0.022)` (76), `cushion(parent, mat, slot, w, h, d, x, y, z)` (115),
  `panel` (129), `handle(parent, mat, slot, 'bar'|'knob'|'groove', x, y, z, vertical=true)` (143),
  `matOf(ctx, slot)` (9), `group()` (13), `clamp(v, min, max)` (310).
- `src/catalog/types.ts:15-19` — `BuildContext { size, materials, params }`.
- Geometry convention (`types.ts:50`): origin at the bottom centre, +x width, +z depth (front),
  +y up; the bounds must equal `ctx.size` at any size (`tests/catalog/catalog.test.ts:13-32`,
  tolerance 0.02 m). `registerEntries` wraps `build` with `occupy()` so a slightly smaller
  mesh set still passes, but nothing may stick out.
- Pattern to copy: `src/catalog/entries/kitchen.ts:178-192` (`fridge-tall`), `bathroom.ts:110-127`.

## Steps
1. `tests/catalog/families.test.ts` (new). For each generator, build at three sizes —
   `{w:0.6,d:0.4,h:0.8}`, `{w:1.8,d:0.6,h:2.2}`, `{w:3.2,d:1.1,h:0.45}` — with
   `materials = { body: m, front: m, handle: m, frame: m, shelf: m, fabric: m, legs: m, linen: m }`
   where `m = new THREE.MeshStandardMaterial()`, and assert the `Box3` of the returned group is
   within 0.02 of `[-w/2, 0, -d/2]..[w/2, h, d/2]` (copy `expectSize` from
   `tests/catalog/catalog.test.ts:13-32`). Also assert: `buildCabinet` with `doors: 3, drawers: 2`
   produces at least 5 meshes with `userData.slot === 'front'`; `buildShelfUnit` with
   `shelves: 4` has exactly 5 meshes with `userData.slot === 'shelf'` (4 shelves + top);
   `buildBed` with `headboard: 'none'` has no mesh with `userData.slot === 'headboard'`;
   `buildSofa` with `seats: 3` has exactly 3 meshes tagged `userData.slot === 'fabric'` and
   `userData.part === 'seat'`.
2. `src/catalog/families/cabinet.ts` (new):
   ```ts
   export interface CabinetOptions {
     doors: number            // 0..6 side by side, each gets a handle
     drawers: number          // 0..6 stacked above the doors (drawers take 0.18 m each, max 40 % of h)
     handle: 'bar' | 'knob' | 'groove' | 'none'
     plinth: number           // metres, 0 = none; default 0.08
     slots?: { body?: string; front?: string; handle?: string }   // defaults 'body','front','handle'
   }
   export function buildCabinet(ctx: BuildContext, opts: CabinetOptions): THREE.Group
   ```
   Body: `roundedBox(w, h - plinth, d - 0.02, 0, plinth + (h-plinth)/2, -0.01, 0.006)`; plinth
   box `w-0.04 × plinth × d-0.06` at the back; fronts are `0.018` thick boxes flush at
   `z = d/2 - 0.009` with a 0.004 m gap between them; drawer band height
   `min(drawers*0.18, 0.4*(h-plinth))`; handles via `handle()` at `z = d/2 + 0.012` — but clamp:
   if a handle would exceed `d/2`, place it at `d/2 - 0.008` so the bounds hold (the test
   checks this). `handle: 'none'` skips them. Clamp counts with `clamp(Math.round(n), 0, 6)`.
3. `src/catalog/families/shelfUnit.ts` (new):
   ```ts
   export interface ShelfUnitOptions { shelves: number; backPanel: boolean; sideThickness?: number; slots?: { frame?: string; shelf?: string } }
   export function buildShelfUnit(ctx: BuildContext, opts: ShelfUnitOptions): THREE.Group
   ```
   Two sides (`t = sideThickness ?? 0.025`), a top (slot `shelf`), `shelves` evenly spaced
   shelves (slot `shelf`, thickness `t`), optional back panel `0.012` thick at `z = -d/2 + 0.006`.
   Shelves clamp to 1..12.
4. `src/catalog/families/bed.ts` (new):
   ```ts
   export interface BedOptions { headboard: 'none' | 'panel' | 'upholstered' | 'slatted'; legHeight?: number; slots?: { frame?: string; linen?: string; headboard?: string } }
   export function buildBed(ctx: BuildContext, opts: BedOptions): THREE.Group
   ```
   Headboard at the back (`-z`), thickness 0.06 (`upholstered` 0.1 with a `cushion`), height = `h`
   (the headboard sets the item height); frame `0.12` tall on legs `legHeight ?? 0.15`; mattress
   (`cushion`, slot `linen`) `0.22` tall × `w - 0.08` × `d - headboardT - 0.1`; a pillow pair
   (`cushion`) 0.08 tall. `slatted` = 5 vertical `roundedBox` bars. When `headboard === 'none'`,
   the mattress top is at `h` (scale mattress height to reach `h`).
5. `src/catalog/families/sofa.ts` (new):
   ```ts
   export interface SofaOptions { seats: number; arms: 'square' | 'rolled' | 'none'; slots?: { fabric?: string; legs?: string } }
   export function buildSofa(ctx: BuildContext, opts: SofaOptions): THREE.Group
   ```
   Legs `fourLegs` 0.08 tall; base `cushion` from 0.08 to 0.4·h; `seats` seat cushions
   (`cushion`, set `mesh.userData.part = 'seat'`) side by side between the arms; a backrest
   per seat (`userData.part = 'back'`) up to `h`; arms `armW = arms === 'none' ? 0 : min(0.22, w*0.12)`,
   `rolled` arms are `cylinder` along z with radius `armW/2` on top of a box. Seats clamp 1..6.
6. `src/catalog/families/index.ts` — re-export the four functions and option types.

## Tests to add
- `tests/catalog/families.test.ts` — step 1 (12 bounds checks + 4 structural checks).

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/builders` green
  (`tests/builders/uvs.test.ts` and `uvScale.test.ts` still pass because `metricUVs` is applied by
  the parts helpers).
- `npx vitest run tests/catalog/families.test.ts` prints `passed`.
- No file under `src/catalog/entries/` changed: `git status --porcelain src/catalog/entries` is empty.

## Out of scope / forbidden
- Do not edit existing entries or tests; do not add catalog entries (c04–c07 do).
- Do not add i18n strings (the generators have no UI).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
