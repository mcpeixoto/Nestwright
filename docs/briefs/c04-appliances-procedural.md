# c04 — Appliances: 12 procedural entries

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c02, c03, c08
**Time box:** ≤ 20 min of agent work

## Goal
The Appliances tab offers a dishwasher, single oven, hob, 90 cm range cooker, island hood,
two sink units, fridge-freezer, under-counter fridge, wine fridge, washer-dryer and chest
freezer, each a sized procedural model with its own materials and price. (`microwave`,
`range-hood`, `fridge-tall`, `fridge-american`, `coffee-machine` already exist and were moved
to this tab by c03; do not duplicate them.)

## Context the implementer needs
- Entry format: `src/catalog/entries/kitchen.ts:178-265` (`fridge-tall`, `range-hood`, `microwave`).
  `const ref = (id: string) => ({ id })` at the top of each entries file.
- Helpers: `src/catalog/parts.ts` — `roundedBox`, `cylinder`, `glassPane(parent, mat, slot, w, h, d, x, y, z, opacity=0.32)`,
  `torusRing(parent, mat, slot, radius, tube, x, y, z, flat=true)`, `handle`, `matOf`, `group`.
  Families: `src/catalog/families/index.ts` — `buildCabinet(ctx, { doors, drawers, handle, plinth, slots })`.
- Registration: add `import './entries/appliances'` to `src/catalog/index.ts` after the
  `kitchen` line. Ids must be literal `id: '...'` (`scripts/content/lib/ids.mjs` greps them).
- Material ids must exist in `src/materials/library.ts` (used below: `plaster-white`,
  `metal-black`, `steel-brushed`, `chrome`, `glass`, `oak-planks`, `quartz-worktop`, `paint-charcoal`).
- i18n: `src/i18n/en.ts` gets `'catalog.<id>': '<Name>'` after the last `'catalog.*'` line;
  `pt.ts` the Portuguese. Slot labels: `body`, `metal`, `glass`, `door`, `front`, `top` already
  have keys (`'Body'`, `'Metal'`, `'Glass'`, `'Door'`, `'Front'`, `'Top'` — verify each with
  `grep -n "^  '<Label>'\|^  <Label>:" src/i18n/en.ts`; add any missing one to en and pt).
- Bounds rule: `tests/catalog/catalog.test.ts` builds each entry at `defaultSize` and at
  `w×1.7, d×0.62, h×1.35`; every dimension of the mesh set must scale with `ctx.size`.

## Steps
1. `tests/catalog/appliances.test.ts` (new): import `'../../src/catalog'`; assert
   `listEntries('appliances').length >= 17`; each of the 12 ids below exists, has
   `category === 'appliances'`, `price > 0`, and the listed `mount`; `island-hood` has
   `mount === 'ceiling'`; `hob-4` has `surface` undefined and `h <= 0.06`.
2. `src/catalog/entries/appliances.ts` (new) with these entries (name / size w×d×h m / price € / slots / recipe):
   - `dishwasher` "Dishwasher" 0.6×0.6×0.85 / 520 / `front: steel-brushed, body: plaster-white, handle: chrome` —
     `buildCabinet(ctx, { doors: 1, drawers: 0, handle: 'bar', plinth: 0.1, slots: { body: 'body', front: 'front', handle: 'handle' } })`,
     then a control strip `roundedBox(front, w*0.9, 0.04, 0.01, 0, h-0.03, d/2-0.005)`.
   - `oven-single` "Single oven" 0.6×0.58×0.6 / 640 / `body: metal-black, glass: glass, metal: chrome` —
     body box; `glassPane(w*0.8, h*0.55, 0.01, 0, h*0.45, d/2-0.01, 0.3)`; horizontal bar handle
     `cylinder(radius 0.01, w*0.8, 0, h*0.78, d/2-0.012, 'x')`; two knobs `cylinder(0.014, 0.02, ±w*0.3, h*0.9, d/2-0.012, 'z')`.
   - `hob-4` "Hob, 4 rings" 0.6×0.52×0.05 / 380 / `top: metal-black, metal: steel-brushed` —
     plate `roundedBox(w, h*0.6, d, 0, h*0.3, 0, 0.004)`; 4 rings `torusRing(radius min(w,d)*0.14, 0.006, ±w*0.25, h*0.8, ±d*0.22)`.
   - `range-cooker-90` "Range cooker 90" 0.9×0.6×0.9 / 2200 / `body: paint-charcoal, metal: steel-brushed, glass: glass` —
     body box to `h*0.95`; top plate `h*0.05` metal; two oven doors glass panes `w*0.42` wide; rail `cylinder(0.012, w*0.95, 0, h*0.72, d/2-0.012, 'x')`; 5 knobs along `h*0.86`.
   - `island-hood` "Island hood" 0.9×0.5×0.6 / 780 / `body: steel-brushed, glass: glass` / `mount: 'ceiling'` —
     chimney `roundedBox(w*0.3, h*0.6, d*0.4, 0, h*0.7, 0)`; canopy `roundedBox(w, h*0.12, d, 0, h*0.06, 0)`; glass visor `glassPane(w, 0.01, d*0.6, 0, h*0.13, d*0.1, 0.3)`.
   - `sink-unit-60` "Sink unit 60" 0.6×0.6×1.2 / 420 / `body: plaster-white, front: oak-planks, top: quartz-worktop, metal: chrome` —
     the item height `h` includes the tap: cabinet = `buildCabinet(ctx', …)` where `ctx'` has
     `size.h = h - 0.3` (`{ doors: 1, drawers: 0, handle: 'bar', plinth: 0.1 }`); worktop
     `roundedBox(top, w, 0.04, d, 0, h-0.3+0.02, 0)`; basin `roundedBox(metal, w*0.7, 0.012, d*0.6, 0, h-0.3+0.046, 0)`;
     tap = `cylinder(metal, 0.012, 0.26, 0, h-0.3+0.04+0.13, -d*0.3, 'y')` plus a spout
     `cylinder(metal, 0.01, d*0.3, 0, h-0.01, -d*0.15, 'z')` so the top of the spout is at `h`.
     (`defaultSize.h = 1.2` puts the worktop at 0.9 m.)
   - `sink-unit-80` "Sink unit 80" 0.8×0.6×1.2 / 520 — same as above with `doors: 2`.
   - `fridge-freezer` "Fridge-freezer" 0.6×0.65×1.85 / 820 / `body: steel-brushed, metal: metal-black` —
     body box; split line groove `roundedBox(metal, w, 0.006, 0.01, 0, h*0.38, d/2-0.005)`; two vertical bar handles at `x = w*0.36`, `y = h*0.55` and `h*0.2`.
   - `fridge-under-counter` "Under-counter fridge" 0.6×0.6×0.85 / 360 / `body: plaster-white, metal: chrome` — body + one bar handle.
   - `wine-fridge` "Wine fridge" 0.6×0.6×0.85 / 690 / `body: metal-black, glass: glass, metal: chrome` —
     body; glass door `glassPane(w*0.85, h*0.8, 0.01, 0, h*0.5, d/2-0.01, 0.3)`; 4 horizontal shelf lines `roundedBox(metal, w*0.8, 0.008, 0.02, 0, h*(0.2+i*0.17), d/2-0.03)`.
   - `washer-dryer` "Washer-dryer" 0.6×0.6×0.85 / 640 / `body: plaster-white, door: chrome` — copy `washing-machine`
     (`bathroom.ts:129-144`) and add a second small ring `torusRing(min(w,h)*0.08, 0.008, w*0.3, h*0.82, d/2-0.01, false)`.
   - `chest-freezer` "Chest freezer" 1.0×0.6×0.85 / 430 / `body: plaster-white, metal: metal-black` —
     body to `h-0.03`; lid `roundedBox(w, 0.03, d, 0, h-0.015, 0, 0.006)`; handle bar along x at the lid front.
   Every entry: `category: 'appliances'`, `tags: ['appliance']`, `againstWall: true` except `island-hood`.
3. `src/catalog/index.ts` — add the import.
4. `src/i18n/en.ts`, `pt.ts` — 12 `catalog.<id>` keys. pt names: Máquina de lavar loiça, Forno,
   Placa de 4 bicos, Fogão 90, Exaustor de ilha, Módulo de lava-loiça 60, Módulo de lava-loiça 80,
   Frigorífico combinado, Frigorífico sob bancada, Garrafeira, Máquina de lavar e secar, Arca congeladora.
   Slot key `'Front'`/`'Frente'` and `'Handle'`/`'Puxador'` if missing.

## Tests to add
- `tests/catalog/appliances.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/builders` green
  (`catalog.test.ts` proves all 12 fill their bounds at both sizes).
- `npx vitest run tests/catalog/appliances.test.ts` prints `passed`.
- `grep -c "id: '" src/catalog/entries/appliances.ts` prints `12`.

## Out of scope / forbidden
- Do not change the five existing appliance entries. No scanned models here (c09).
- Do not edit existing tests or user-facing strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
