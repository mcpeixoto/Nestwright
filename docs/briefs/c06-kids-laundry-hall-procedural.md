# c06 — Kids, laundry and hall: 16 procedural entries

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c02, c03, c08
**Time box:** ≤ 20 min of agent work

## Goal
The Kids, Laundry and Hall tabs (empty after c03, except the two laundry machines) are
populated: 6 kids items, 4 laundry items and 6 hall items, each a sized procedural model with
materials, price and, for wall items, a mount height.

## Context the implementer needs
- Entry format: `src/catalog/entries/bedroom.ts` (`crib`, `bunk-bed`), `bathroom.ts:87-127`
  (wall items), `living.ts` (`tv-unit`, `sideboard` for cabinets).
- Families (c08): `src/catalog/families/index.ts` — `buildCabinet`, `buildShelfUnit`, `buildBed`.
- Helpers: `src/catalog/parts.ts` — `roundedBox`, `cylinder`, `fourLegs`, `cushion`, `glassPane`,
  `lathe`, `handle`, `matOf`, `group`, `clamp`.
- Registration: `src/catalog/index.ts` — add `import './entries/kids'`, `'./entries/laundry'`,
  `'./entries/hall'` after the `bathroom` line.
- Materials used: `oak-planks`, `oak-whitewashed`, `paint-sage`, `paint-terracotta`, `fabric-linen`,
  `boucle`, `plaster-white`, `metal-black`, `steel-brushed`, `chrome`, `mirror`, `walnut-planks`, `rattan`.
- i18n: `catalog.<id>` keys in `en.ts`/`pt.ts`. Slot labels needing keys if absent (check
  `grep -n "^  '<Label>'\|^  <Label>:" src/i18n/en.ts`): `'Fabric'` (exists, material category),
  `'Frame'`, `'Body'`, `'Legs'`, `'Shelf'`, `'Seat'`, `'Metal'`, `'Mirror'`, `'Canvas'`/`'Lona'`, `'Pad'`/`'Almofada'`.
- Bounds rule: `tests/catalog/catalog.test.ts` builds at `defaultSize` and at `w×1.7, d×0.62, h×1.35`.

## Steps
1. `tests/catalog/kidsLaundryHall.test.ts` (new): import `'../../src/catalog'`; assert
   `listEntries('kids').length === 6` (plus `crib`/`bunk-bed` stay `bedroom`), `listEntries('laundry').length === 6`
   (4 new + `washing-machine`, `dryer`), `listEntries('hall').length === 6`; `key-shelf` and
   `wall-mirror` have `mount === 'wall'`; `coat-rack.againstWall === true`; every new id has `price > 0`.
2. `src/catalog/entries/kids.ts` (new), `category: 'kids'`, tags `['kids']` plus a type tag:
   - `toddler-bed` "Toddler bed" 1.5×0.75×0.6 / 260 / `frame: oak-whitewashed, linen: fabric-linen` —
     `buildBed(ctx, { headboard: 'panel', legHeight: 0.1, slots: { frame: 'frame', linen: 'linen', headboard: 'frame' } })`
     plus a side rail `roundedBox(frame, w*0.6, 0.12, 0.02, -w*0.1, h*0.75, d/2-0.01)` — the rail stays under `h` because the headboard sets `h`.
   - `changing-table` "Changing table" 0.9×0.75×1.0 / 320 / `body: oak-whitewashed, pad: fabric-linen` —
     `buildShelfUnit(ctx', { shelves: 2, backPanel: true, slots: { frame: 'body', shelf: 'body' } })` with `ctx'.size.h = h-0.08`; pad `cushion(pad, w-0.04, 0.08, d-0.04, 0, h-0.04, 0)`.
   - `toy-chest` "Toy chest" 0.8×0.4×0.45 / 120 / `body: paint-sage, lid: oak-planks` — box to `h-0.03`, lid `roundedBox(lid, w, 0.03, d, 0, h-0.015, 0, 0.006)`.
   - `kids-desk` "Kids desk" 0.9×0.5×0.62 / 150 / `top: oak-whitewashed, legs: paint-terracotta` —
     top `roundedBox(top, w, 0.03, d, 0, h-0.015, 0)`; `fourLegs(legs, w, d, h-0.03, 0.02)`.
   - `high-chair` "High chair" 0.5×0.55×0.95 / 110 / `frame: oak-planks, seat: fabric-linen` —
     four splayed legs as `cylinder(frame, 0.015, h*0.62, ±w*0.4, h*0.31, ±d*0.35)`; seat `cushion(seat, w*0.7, 0.05, d*0.6, 0, h*0.64, 0)`;
     back `roundedBox(frame, w*0.7, h*0.3, 0.02, 0, h*0.82, -d*0.28)`; tray `roundedBox(frame, w, 0.02, d*0.4, 0, h*0.8, d*0.3)`.
   - `play-tent` "Play tent" 1.1×1.1×1.3 / 80 / `canvas: fabric-linen, poles: oak-planks` —
     `lathe(canvas, [[0, 0], [0.5, 0], [0.5, 0.05], [0.02, 1], [0, 1]], w, h*0.95, d, 0, 0, 0)` — `lathe` (parts.ts:189)
     takes `[radius, height]` pairs and stretches the result to fill `w × h × d` sitting on `y`, so the profile units are arbitrary;
     pole tip `cylinder(poles, 0.012, h*0.08, 0, h*0.96, 0)`.
3. `src/catalog/entries/laundry.ts` (new), `category: 'laundry'`, tags `['laundry']`:
   - `utility-sink` "Utility sink" 0.6×0.5×0.9 / 240 / `body: plaster-white, metal: chrome` / `againstWall: true` —
     basin box `roundedBox(body, w, 0.25, d, 0, h-0.3-0.125, 0)` on two `cylinder(metal, 0.02, h-0.55, ±w*0.4, (h-0.55)/2, 0)` legs; tap `cylinder(metal, 0.012, 0.28, 0, h-0.16, -d*0.3)` with spout `cylinder(metal, 0.01, d*0.3, 0, h-0.01, -d*0.15, 'z')`.
   - `ironing-board` "Ironing board" 1.2×0.35×0.85 / 60 / `top: fabric-linen, legs: steel-brushed` —
     top `roundedBox(top, w, 0.03, d, 0, h-0.015, 0, 0.01)`; two crossed legs `cylinder(legs, 0.012, hypot(w*0.6, h-0.03), 0, (h-0.03)/2, 0, 'y')` rotated `±0.35` rad about z (`mesh.rotation.z`) — keep x within `±w/2` by using length `(h-0.03)/cos(0.35)` and check `tan(0.35)*(h-0.03) <= w/2` at the stretched size (it is).
   - `drying-rack` "Drying rack" 1.0×0.55×1.0 / 45 / `metal: steel-brushed` —
     two A-frames: `cylinder(metal, 0.008, h, ±(w/2-0.01), h/2, ±(d/2-0.01))` ×4 uprights; 6 rails `cylinder(metal, 0.006, w-0.02, 0, h*(0.3+i*0.12), ±d*0.25, 'x')`.
   - `utility-cupboard` "Tall utility cupboard" 0.6×0.4×2.0 / 380 / `body: plaster-white, front: plaster-white, handle: metal-black` / `againstWall: true` —
     `buildCabinet(ctx, { doors: 1, drawers: 0, handle: 'bar', plinth: 0.08 })`.
4. `src/catalog/entries/hall.ts` (new), `category: 'hall'`, tags `['hall']`:
   - `coat-rack` "Coat rack" 0.8×0.25×1.8 / 95 / `frame: metal-black, shelf: oak-planks` / `againstWall: true` —
     two uprights `cylinder(frame, 0.012, h, ±(w/2-0.02), h/2, -d/2+0.02)`; shelf `roundedBox(shelf, w, 0.02, d, 0, h*0.92, 0)`; rail `cylinder(frame, 0.01, w-0.04, 0, h*0.85, 0, 'x')`; 5 hooks `cylinder(frame, 0.006, d*0.4, x_i, h*0.85, d*0.1, 'z')`.
   - `shoe-cabinet` "Shoe cabinet" 0.8×0.3×1.0 / 210 / `body: oak-planks, front: plaster-white, handle: metal-black` / `againstWall: true` —
     `buildCabinet(ctx, { doors: 0, drawers: 3, handle: 'groove', plinth: 0.05 })`.
   - `console-table` "Console table" 1.1×0.35×0.8 / 240 / `top: walnut-planks, legs: metal-black` / `againstWall: true` / `surface: { height: 0.8 }` —
     top `roundedBox(top, w, 0.03, d, 0, h-0.015, 0)`; `fourLegs(legs, w, d, h-0.03, 0.015)`.
   - `hall-bench` "Hall bench" 1.0×0.4×0.45 / 170 / `seat: boucle, frame: oak-planks` —
     frame box `roundedBox(frame, w, h-0.06, d, 0, (h-0.06)/2, 0)` with a cushion `cushion(seat, w-0.02, 0.06, d-0.02, 0, h-0.03, 0)`.
   - `key-shelf` "Key shelf" 0.4×0.1×0.12 / 35 / `shelf: oak-planks, metal: metal-black` / `mount: 'wall', mountHeight: 1.4` —
     shelf `roundedBox(shelf, w, 0.02, d, 0, h-0.01, 0)`; back `roundedBox(shelf, w, h-0.02, 0.012, 0, (h-0.02)/2, -d/2+0.006)`; 4 hooks `cylinder(metal, 0.004, d*0.5, x_i, h*0.4, 0, 'z')`.
   - `wall-mirror` "Wall mirror" 0.6×0.04×1.2 / 120 / `frame: oak-planks, mirror: mirror` / `mount: 'wall', mountHeight: 0.6` —
     frame `roundedBox(frame, w, h, d, 0, h/2, 0, 0.004)`; pane `roundedBox(mirror, w-0.06, h-0.06, 0.006, 0, h/2, d/2-0.003, 0)`.
5. `src/catalog/index.ts` — the three imports.
6. `src/i18n/en.ts`, `pt.ts` — 16 `catalog.<id>` keys. pt: Cama de criança, Trocador, Arca de brinquedos,
   Secretária infantil, Cadeira de refeição, Tenda de brincar, Tanque de lavar, Tábua de engomar,
   Estendal, Armário de arrumos alto, Bengaleiro, Sapateira, Consola, Banco de entrada,
   Prateleira de chaves, Espelho de parede. Add missing slot keys (step list in Context).

## Tests to add
- `tests/catalog/kidsLaundryHall.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/builders` green.
- `grep -c "id: '" src/catalog/entries/kids.ts src/catalog/entries/laundry.ts src/catalog/entries/hall.ts` prints `6`, `4`, `6`.

## Out of scope / forbidden
- Do not touch `crib`, `bunk-bed`, `washing-machine`, `dryer` or any existing entry, test or string.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
