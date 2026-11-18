# c01 — Catalog entry fields: surface, roomTags, presets, thumbnail

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Catalog entries can say that things may be dropped on top of them (`surface`), which room
types they belong in (`roomTags`), which colourways they ship with (`presets`) and whether the
library card should show the scanned model (`thumbnail`). The pendant lamp is a real ceiling
item instead of a hard-coded exception, and dropping a small item on a table lands it on the
table top instead of the floor.

## Context the implementer needs
- `src/catalog/types.ts:21-52` — `CatalogEntry`. `MaterialRef` is already imported at line 2.
- `src/model/types.ts:75-90` — `RoomType` union (`'living' | 'kitchen' | … | 'kids' | 'other'`).
- `src/tools/placeItem.ts:27-33` — `elevationFor(id, entry, level)`; line 28 special-cases
  `id === 'pendant-lamp'`. `poseAt` is at 52-66, `onPointerDown` at 85-111.
- `src/catalog/entries/basic.ts` — `id: 'pendant-lamp'` entry (no `mount` today).
- `src/plan2d/snap.ts:109` — `pointInItem(point, position, w, d, rotation)`.
- `src/model/` must stay pure (no three, React, DOM). The new surface lookup goes in a new pure
  file and is tested there; `placeItem.ts` only calls it.
- Test style: `tests/model/freeSpot.test.ts:1-30` builds a `Level` with `createLevel` from
  `src/model/defaults.ts` and hand-made `Item` literals.

## Steps
1. `tests/catalog/fields.test.ts` (new). Import `'../../src/catalog'` and `getEntry`. Assert:
   `getEntry('pendant-lamp')!.mount === 'ceiling'`; for every id in the SURFACE table below,
   `entry.surface!.height` equals `entry.defaultSize.h` within 1e-6; `getEntry('coffee-table')!.roomTags`
   is `undefined` (tags come in c10); `getEntry('sofa-3')!.presets` is `undefined` (data comes in f03).
2. `tests/model/placeOnSurface.test.ts` (new). Build a level with one item
   `{ id: 'tbl', catalogId: 'coffee-table', position: {x: 2, y: 2}, elevation: 0, rotation: 0, size: {w: 1.2, d: 0.6, h: 0.45}, materials: {}, params: {} }`.
   Assert `surfaceElevationAt(level, {x: 2.1, y: 2.05}, lookup) === 0.45`; `surfaceElevationAt(level, {x: 5, y: 5}, lookup) === 0`;
   with the table resized to `h: 0.9` the result is `0.9` (height scales with the item); a second
   item with no `surface` (`catalogId: 'rug'`) at the same spot gives `0`; two stacked surfaces
   (table at elevation 0, a `books` item is not a surface) still give `0.45`. `lookup` is
   `(id) => getEntry(id)` after importing `'../../src/catalog'`.
3. `src/catalog/types.ts` — add to `CatalogEntry` after `againstWall` (line 49):
   ```ts
   /** Items may be dropped on top; `height` is the top face at `defaultSize` (scaled with the item). */
   surface?: { height: number }
   /** Room types this entry suits (dress-room and library hints). Absent = anywhere. */
   roomTags?: RoomType[]
   /** Named colourways: slot → material. */
   presets?: { id: string; name: string; slots: Record<string, MaterialRef> }[]
   /** Library card image: the procedural build (default) or the scanned model when loaded. */
   thumbnail?: 'procedural' | 'model'
   ```
   Import `RoomType` with `import type { MaterialRef, RoomType } from '../model/types'`.
4. `src/model/surfaces.ts` (new, pure):
   ```ts
   export interface SurfaceLookup { (id: string): { surface?: { height: number }; defaultSize: { h: number } } | undefined }
   /** Elevation of the highest surface under `point`, 0 when none. */
   export function surfaceElevationAt(level: Level, point: Vec2, lookup: SurfaceLookup): number
   ```
   For each `level.items` whose entry has `surface` and `pointInItem(point, item.position, item.size.w, item.size.d, item.rotation)`,
   candidate = `item.elevation + surface.height * (item.size.h / entry.defaultSize.h)`; return the max, else 0.
   Copy `pointInItem` into this file (3 lines of maths) rather than importing from `src/plan2d/`.
5. `src/tools/placeItem.ts` — `elevationFor(id, entry, level)` drops the `|| id === 'pendant-lamp'`
   clause (line 28) and gains a fourth argument `point: Vec2`: for `mount` undefined or `'floor'`,
   return `surfaceElevationAt(level, point, getEntry)` instead of `0`. Pass `ctx.point` at lines 62 and 93.
6. `src/catalog/entries/basic.ts` — add `mount: 'ceiling',` to the `pendant-lamp` entry.
7. `src/catalog/entries/*.ts` — add `surface: { height: <defaultSize.h> }` to exactly these ids:
   `coffee-table`, `dining-table`, `nightstand`, `desk`, `bookshelf` (basic.ts); `side-table`,
   `sideboard`, `tv-unit` (living.ts); `round-table`, `extendable-table`, `buffet` (dining.ts);
   `dresser`, `vanity` (bedroom.ts); `desk-l`, `standing-desk`, `filing-cabinet`, `shelving-unit`
   (office.ts); `shelf-wall` (decor.ts); `bathroom-cabinet` (bathroom.ts); `kitchen-island` (kitchen.ts).
   The value is the literal `h` of that entry's `defaultSize`.

## Tests to add
- `tests/catalog/fields.test.ts` — step 1 assertions.
- `tests/model/placeOnSurface.test.ts` — step 2 assertions.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/model tests/tools tests/i18n` green.
- `grep -n "pendant-lamp" src/tools/placeItem.ts` prints nothing.
- `grep -c "surface: { height:" src/catalog/entries/*.ts | awk -F: '{s+=$2} END {print s}'` prints `20`.

## Out of scope / forbidden
- Do not edit existing tests or user-facing strings.
- Do not set `roomTags`, `presets` or `thumbnail` on any entry (c10, f03 and c09 do).
- Do not change `src/templates/build.ts` or `freeSpot.ts`.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
