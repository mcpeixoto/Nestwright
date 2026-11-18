# c10 — Dress room: one-click props on surfaces and in corners

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c01 (`surface`, `roomTags`), c05 (`laundry-basket`), c06 (`toy-chest`, `console-table`)
**Time box:** ≤ 20 min of agent work

## Goal
A "Dress room" button in the room inspector drops a few props into the selected room — books on
shelves, a vase on tables, cushions on sofas and beds, a plant or basket in a free corner —
never crowding a surface, in one undo step. Props cost nothing in the budget until the player
moves, rotates or edits them. Running it again replaces the previous props of that room.

## Context the implementer needs
- Pure model rules: `src/model/` has no three/React/DOM. `src/model/budget.ts:119` `itemCost`,
  `286-299` the per-item push; `src/model/ops/index.ts:260` `addItem`, `264` `moveItems`,
  `272` `rotateItems`; `src/model/clearance.ts:25` `itemFootprint(item)`; `src/model/geometry.ts:98`
  `pointInPolygon(p, poly)`; `src/model/types.ts:107-111` `Room { polygon, area, centroid, key, name, type }`,
  `172-194` `Item`.
- `src/model/surfaces.ts` (c01): `surfaceElevationAt(level, point, lookup)`.
- Room inspector: `src/ui/inspector/sections/room.tsx:32-100` (`RoomSection`, `patchLevel`,
  `roomsFor`). Store: `useStore.getState().apply(label, recipe)` (`src/store/index.ts:156`).
- Catalog entry type: `src/catalog/types.ts` (`CatalogEntry.roomTags`, `surface`, `defaultSize`,
  `materialSlots`, `price`, `mount`). Prop ids and sizes: `decor.ts` `books` 0.28×0.22×0.18,
  `vase` 0.22×0.22×0.36, `candles` 0.22×0.12×0.2, `cushion` 0.5×0.5×0.16; `basic.ts` `plant-pot`;
  c05 `laundry-basket` 0.4×0.4×0.6; c06 `toy-chest` 0.8×0.4×0.45.
- Save schema: `prop?: boolean` is an optional field; `src/io/migrate.ts:13-16` documents that
  absent optional fields load unchanged and `tests/io/project.test.ts:19` pins `version` at 1, so
  **no `PROJECT_VERSION` bump**: add one comment line to the `migrate` doc block instead.
- Test fixtures: `tests/model/freeSpot.test.ts:1-30` (`createLevel`, `createWall`, `box()` helper,
  `item()` literal). `roomsFor(level)` / `detectRooms(level)` (`src/model/rooms.ts:461`) returns
  the `Room[]` for a closed wall loop.

## Steps
1. `tests/model/dress.test.ts` (new). Build a 4×5 m room with `box(level, 0, 0, 4, 5)`, set
   `level.rooms = [{ key, name: 'Living', type: 'living', floor: {id:'oak-planks'}, ceiling: {id:'plaster-white'} }]`
   where `key` is `detectRooms(level)[0].key`, add `coffee-table` (1.2×0.6×0.45 at 2, 2.5) and
   `sofa-3` (2.2×0.95×0.8 at 2, 1). `lookup = (id) => getEntry(id)` after `import '../../src/catalog'`.
   Assert `dressRoom(level, room, lookup)`:
   - returns items whose every `id` starts with `dress:${room.key}:` and every `prop === true`;
   - contains exactly one item on the table (`catalogId` in `['vase','candles']`,
     `elevation` within 1e-6 of 0.45, `position` equals the table position);
   - contains one `cushion` with `elevation` 0.8·0.55 ≈ 0.44 (seat height = 55 % of the sofa) on the sofa;
   - contains ≤ 2 corner props (`catalogId === 'plant-pot'`) and each is ≥ 0.3 m from every wall and
     inside the polygon (`pointInPolygon`);
   - a 3 m × 1 m `dining-table` gets 2 props (`floor(3/1.5) = 2`), a 0.5×0.5 `side-table` gets 1;
   - a room of type `'bathroom'` gets `laundry-basket` instead of `plant-pot`;
   - calling `applyDress(level, room, lookup)` twice leaves the same number of items as once.
   Also test `estimateBudget` (`src/model/budget.ts:186`) on a project whose only item has
   `prop: true`: items total is 0; after `delete item.prop` it equals the catalog price.
2. `src/model/types.ts` — add to `Item` after `locked?`:
   `/** Placed by "Dress room"; free in the budget until the player edits it. */ prop?: boolean;`.
   `src/io/migrate.ts` doc block: add "Optional Item.prop: absent means a player-placed item."
3. `src/model/dress.ts` (new, pure):
   ```ts
   export type DressLookup = (id: string) => Pick<CatalogEntry, 'defaultSize' | 'surface' | 'roomTags' | 'materialSlots' | 'price' | 'mount'> | undefined
   export function dressPrefix(roomKey: string): string            // `dress:${roomKey}:`
   export function dressRoom(level: Level, room: Room, lookup: DressLookup): Item[]
   export function applyDress(level: Level, room: Room, lookup: DressLookup): void  // removes old prefix items, pushes dressRoom()
   export function touchItem(item: Item): void                      // delete item.prop
   ```
   Rules, in order, all deterministic (no randomness; iterate `level.items` in array order):
   - Hosts = items with `pointInPolygon(item.position, room.polygon)` whose entry has `surface`
     and (`roomTags` undefined or includes `room.type`), excluding items with `prop`.
   - Per host: `cap = max(1, floor(size.w * size.d / 1.5))`, surface elevation
     `item.elevation + surface.height * (size.h / defaultSize.h)`. Prop choice by host
     `catalogId`: shelves (`bookshelf`, `bookshelf-tall`, `shelving-unit`, `shelf-wall`, `bookcase-open`) → `books`;
     tables (`coffee-table`, `side-table`, `console-table`, `nightstand`) → `vase` first, `candles` second;
     `dining-table`, `round-table`, `extendable-table`, `kitchen-island` → `candles` first, `vase` second;
     everything else with a surface → `vase`. Skip when the prop's `defaultSize.w > size.w*0.8` or `d > size.d*0.8`.
     Positions: 1 prop at the host position; 2 at `±size.w/4` along the host's rotated x axis
     (`rotate({x: ±w/4, y: 0}, item.rotation)` from `geometry.ts:46`). `rotation` = host rotation.
   - Seats (no `surface`): `sofa-3`, `sofa-2`, `sofa-corner`, `armchair`, `armchair-wingback` → one
     `cushion` at the host position, elevation `item.elevation + size.h*0.55`; `bed-double`, `bed-king`,
     `bed-single`, `toddler-bed` → one `cushion` at `rotate({x: 0, y: -size.d/4}, rotation)`, elevation `size.h*0.6`.
   - Corners: for each polygon vertex `v_i` with interior angle between 70° and 110°, the point
     `p = v_i + 0.35 · bisector` (inward); keep it when `pointInPolygon(p)`, `p` is ≥ 0.3 m from
     every wall segment (`closestPointOnSegment(p, wall.a, wall.b)` from `geometry.ts:155`), and
     `p` is ≥ 0.45 m from the centre of every existing item and every prop already placed in this call.
     Corner prop by room type: `bathroom`/`wc`/`laundry` → `laundry-basket`; `kids` → `toy-chest`;
     others → `plant-pot`. At most 2 corners, the first two in vertex order. Skip a corner prop whose id `lookup` misses.
   - Each item: `id = \`${dressPrefix(room.key)}${host.id ?? 'corner-' + i}:${catalogId}:${n}\``,
     `materials` copied from `materialSlots`, `params: {}`, `price: undefined`, `prop: true`.
4. `src/model/budget.ts` — in the item loop (line ≈286) `if (item.prop) continue` before `push`.
5. `src/model/ops/index.ts` — `moveItems` and `rotateItems` call `touchItem(item)` on each moved item.
   `src/ui/inspector/sections/item.tsx` — in the five `patchLevel` recipes for size, rotation,
   elevation and material (lines 40-98) call `touchItem(found)` after the write (import from
   `../../../model/dress`).
6. `src/ui/inspector/sections/room.tsx` — after the Floor picker add
   `<button type="button" onClick={() => patchLevel('Dress room', (draft) => applyDress(draft, room, getEntry))}><T k="Dress room" /></button>`
   (`getEntry` from `../../../catalog/registry`). One `apply` = one undo step.
7. `src/catalog/entries/*.ts` — set `roomTags` on: `sofa-3`, `sofa-2`, `sofa-corner`, `coffee-table`,
   `tv-unit`, `side-table` → `['living']`; `dining-table`, `round-table`, `extendable-table`, `buffet` → `['dining','kitchen']`;
   `bed-double`, `bed-king`, `bed-single`, `nightstand`, `dresser` → `['bedroom']`; `desk`, `desk-l`,
   `standing-desk`, `bookshelf`, `shelving-unit` → `['office','living','bedroom']`; `kitchen-island` → `['kitchen']`;
   `toddler-bed` → `['kids']`; `console-table` → `['hall','living']`.
8. `src/i18n/en.ts`: `'Dress room': 'Dress room'`; `pt.ts`: `'Decorar divisão'`.

## Tests to add
- `tests/model/dress.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/catalog tests/i18n tests/io` green.
- `npx vitest run tests/model/dress.test.ts` prints `passed`.
- In the app: select a furnished living room, click "Dress room", see props; Undo (`mod+z`) once removes all of them; the budget panel items total is unchanged until a prop is dragged.

## Out of scope / forbidden
- No randomness, no three.js in `src/model/dress.ts`. No `PROJECT_VERSION` bump (see Context).
- Do not edit existing tests or user-facing strings; "Dress room" is new.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
