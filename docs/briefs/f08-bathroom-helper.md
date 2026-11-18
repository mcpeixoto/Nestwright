# f08 — Bathroom helper

**Epic:** Features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** f06 (runs in plan/3D), f07 (run kind picker)
**Time box:** ≤ 20 min of agent work

## Goal
A run of `kind: 'vanity'` draws basins and drawers under a worktop at 0.85 m. On a room of type
`bathroom` or `wc` the inspector shows an "Arrange bathroom" button: one click places a toilet,
a shower (bathroom only) and a vanity run with real clearances, out of the door swing, as a
single undo step.

## Context the implementer needs
- Catalog ids (`src/catalog/entries/bathroom.ts`): `wc-wall-hung` (toilet), `walk-in-shower`,
  `double-washbasin`, `freestanding-tub`, `towel-radiator`. Read each `defaultSize`.
- `src/model/freeSpot.ts:51` `freeSpot(level, target, size)` → `{position, rotation}` nearest
  free point inside the room, facing the room centre. `src/model/clearance.ts`: `doorSwings(level)`
  (l.224, quarter-circle polygons per hinged door), `itemFootprint` (l.25), `convexPenetration` (l.67).
- `src/model/rooms.ts`: `Room { key, polygon, area, centroid, type }`, `detectRooms`,
  `nearestWallPoint(level, point)` (l.480). `src/model/walls.ts`: `locateOnWall`, `wallLength`,
  `wallFrame`/`sampleFrame`.
- Runs: `src/model/builtins.ts` (`defaultModules('vanity', len)`, `layoutRun`, `RUN_DEPTH.vanity = 0.5`,
  `RUN_HEIGHT.vanity = 0.85`), `src/builders/runs.ts`, `src/tools/run.ts` kind picker (f07).
- Room section: `src/ui/inspector/sections/room.tsx` (`RoomSection`, `patchLevel`, `edit`).
  Items are added with `addItem(level, item)` (`src/model/ops/index.ts:260`); item shape as in
  `src/tools/placeItem.ts:97–108` (materials copied from `entry.materialSlots`, `price: entry.price`).
- Rotation convention: `Item.rotation` counter-clockwise in plan, front = local +y
  (`src/model/freeSpot.ts:31` `facingRotation`).

## Steps
1. Tests first: `tests/model/bathroomLayout.test.ts`.
2. New `src/model/bathroomLayout.ts` (pure, imports catalog sizes through a parameter so the
   model stays catalog-free):
   ```ts
   export interface FixtureSizes { toilet: Size; shower: Size; vanityDepth: number }
   export interface BathroomPlan { items: Omit<Item, 'materials' | 'price'>[]; run: BuiltinRun | null; notes: string[] }
   export function suggestBathroom(level: Level, room: Room, sizes: FixtureSizes, ids: {toilet: string; shower: string}): BathroomPlan
   ```
   Algorithm, in this order, each step skipping walls that hold a door (`level.openings` with a
   door-like type on that wall, use `isPassableOpening` from `src/model/collision.ts:13`) and
   rejecting any footprint that penetrates a `doorSwings` polygon or an existing item:
   - walls of the room = walls whose ids are in `room.key.split(',')`; for each, the inward
     normal is the side facing `room.centroid`.
   - Toilet: back to the shortest door-free wall, centre `0.4 m` from the nearest side wall
     (`max(0.4, toilet.w / 2 + 0.05)`), back `0.02 m` off the wall face, require `0.6 m` free
     in front (footprint extended by 0.6 toward the room). Try each wall end; first fit wins.
   - Shower (room.type `'bathroom'` only, and `room.area >= 3.5`): `0.9 × 0.9` (or the catalog
     size if larger) in the corner farthest from the door, both backs 0.02 off the walls.
   - Vanity run: on the longest remaining door-free wall segment, `start`/`end` covering
     `min(1.2, free span)` centred on the free span, `side` toward the room, `modules:
     defaultModules('vanity', len)`, `front: {id:'oak-veneer'}`, `worktop: {id:'marble'}`,
     `plinth: 0`, `handle: 'bar'`. Require `0.7 m` free in front.
   - When something does not fit, push a note (`'toilet'`, `'shower'`, `'vanity'`) and continue.
   Footprints use `itemFootprint`; "free" = no penetration > `OVERLAP_EPS` against walls'
   `wallPieces`, items, door swings, or previously placed fixtures.
3. `src/builders/runs.ts`: vanity branch: carcass height `0.85`, worktop `0.03` `marble`,
   `basin-60`/`basin-90` get a recessed basin (`cylinder` scaled to `0.45 × 0.12 × 0.35`,
   `plaster-white`) and a tap (`chrome`, two cylinders) at the back; `vanity-drawers` two fronts.
   Plan layer: draw a basin ellipse inside basin modules.
4. `src/ui/inspector/sections/room.tsx`: when `room.type === 'bathroom' || room.type === 'wc'`
   render `<button type="button">{tr('Arrange bathroom')}</button>`. On click: build `sizes`
   from `getEntry('wc-wall-hung')!.defaultSize`, `getEntry('walk-in-shower')!.defaultSize`,
   `RUN_DEPTH.vanity`; call `suggestBathroom`; one `apply('Arrange bathroom', draft => …)` that
   `addItem`s each item (filling `materials` from the entry slots and `price`) and pushes the run
   into `draft.runs` (create the array if missing). Then `select(ids)`. Show
   `setMessage(tr('No room for {what}', {what}))` when `notes` is non-empty (new string).
5. Strings (en + pt): `'Arrange bathroom'`/`'Arrumar casa de banho'`, `'No room for {what}'`/`'Sem espaço para {what}'`,
   `'Basin 60'`/`'Lavatório 60'`, `'Basin 90'`/`'Lavatório 90'`, `'Vanity drawers'`/`'Gavetas do móvel'`.

## Tests to add
`tests/model/bathroomLayout.test.ts` (sizes passed literally: toilet `{w:0.4,d:0.6,h:0.8}`,
shower `{w:0.9,d:0.9,h:2.1}`, vanityDepth `0.5`)
- "places toilet, shower and vanity in a 2.4 × 2.0 bathroom with the door on the short wall":
  room `(0,0)-(2.4,0)-(2.4,2)-(0,2)`, door at offset 0.6 on the `(0,0)-(2.4,0)` wall →
  `items.length === 2`, `run !== null`, `notes` empty; the toilet centre is `0.4` (±0.02) from a
  side wall and ≥ `0.6 + d/2` from the opposite wall; no footprint penetrates another
  (`convexPenetration <= OVERLAP_EPS` pairwise) or the door swing polygon; the vanity run's
  `wallId` is not the door wall.
- "skips the shower in a wc": `room.type = 'wc'`, 1.0 × 1.6 → one item (toilet), run may be
  null → `notes` contains `'vanity'` or `run` fits `≥ 0.6`.
- "never puts the toilet in front of the door": door on the long wall at offset 1.2 → the
  toilet footprint extended by 0.6 does not intersect the door swing.
- "returns notes instead of overlapping when the room is too small": 0.9 × 1.2 → `notes`
  includes `'toilet'` or every item is clear (assert: no overlaps AND (items.length < 1 || clear)).
- "is deterministic": two calls give deep-equal results apart from ids.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/builders tests/i18n` green,
  including the pre-existing `tests/model/freeSpot.test.ts`, `clearance.test.ts`.
- Manual, described: draw a 2.4 × 2 room, add a door, set type Bathroom, click Arrange
  bathroom, see toilet, shower and vanity in plan and 3D; one Undo removes all three.

## Out of scope / forbidden
- Towel rails, bidets, bathtub placement, tiling.
- Do not edit existing tests or user-facing strings (new keys allowed).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
