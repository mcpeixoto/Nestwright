# c07 — Storage and office: 9 procedural entries

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c02, c03, c08
**Time box:** ≤ 20 min of agent work

## Goal
The Storage tab exists with five sized pieces (a modular wardrobe with a width preset, an open
bookcase with a shelf-count parameter, garage shelving, a wall bike rack, a tall cupboard);
Office gains a printer, a tall bookshelf, a monitor-arm desk and a drawer pedestal. Existing
`wardrobe`, `bookshelf`, `shelving-unit`, `filing-cabinet` stay untouched. (Lighting is c11.)

## Context the implementer needs
- Number param + `paramNum`: `src/catalog/entries/dining.ts:36,43`
  (`{ key: 'leaves', label: 'Leaves', kind: 'number', min: 0, max: 2, step: 1, default: 1 }`,
  `paramNum(ctx.params, 'leaves', 1)`). Enum param + size change: c05 step 3 pattern in
  `src/ui/inspector/sections/params.tsx:24-29`.
- Families (c08): `buildCabinet`, `buildShelfUnit` from `src/catalog/families/index.ts`.
- Registration: `src/catalog/index.ts` — add `import './entries/storage'` after `office`.
- Materials: `oak-planks`, `oak-veneer`, `plaster-white`, `metal-black`, `steel-brushed`,
  `aluminium-brushed`, `chrome`, `metal-brass`, `fabric-linen`, `paint-charcoal`, `walnut-planks`.
- i18n: `catalog.<id>` keys; param labels `'Shelves'`/`'Prateleiras'`, `'Width preset'` (c05 adds
  it — if absent, add), options `'Narrow 100'`/`'Estreito 100'`, `'Standard 150'`/`'Normal 150'`,
  `'Wide 200'`/`'Largo 200'`.

## Steps
1. `tests/catalog/storageOffice.test.ts` (new): import `'../../src/catalog'`; assert
   `listEntries('storage').length === 5`; `listEntries('office').length === 10`; `bookcase-open`
   built with `params: { shelves: 6 }` has 7 meshes with `userData.slot === 'shelf'` and with
   `{ shelves: 2 }` exactly 3; `wardrobe-modular` has a `width` enum param with 3 options.
2. `src/catalog/entries/storage.ts` (new), `category: 'storage'`, tags `['storage']`:
   - `wardrobe-modular` "Modular wardrobe" 1.5×0.6×2.2 / 890 / `body: oak-veneer, front: plaster-white, handle: metal-black` / `againstWall: true` /
     params `[{ key: 'width', label: 'Width preset', kind: 'enum', options: ['Narrow 100', 'Standard 150', 'Wide 200'], default: 'Standard 150' }]` —
     doors `Narrow 100 → 2`, `Standard 150 → 3`, `Wide 200 → 4`; `buildCabinet(ctx, { doors, drawers: 0, handle: 'bar', plinth: 0.06 })`.
   - `bookcase-open` "Open bookcase" 0.9×0.35×1.9 / 320 / `frame: oak-planks, shelf: oak-planks` /
     params `[{ key: 'shelves', label: 'Shelves', kind: 'number', min: 1, max: 8, step: 1, default: 4 }]` —
     `buildShelfUnit(ctx, { shelves: Math.round(clamp(paramNum(ctx.params, 'shelves', 4), 1, 8)), backPanel: false })`.
   - `garage-shelving` "Garage shelving" 1.2×0.45×1.8 / 140 / `frame: steel-brushed, shelf: oak-planks` —
     `buildShelfUnit(ctx, { shelves: 4, backPanel: false, sideThickness: 0.03 })`.
   - `bike-rack` "Wall bike rack" 0.5×0.35×0.3 / 40 / `metal: metal-black` / `mount: 'wall', mountHeight: 1.6` —
     back plate `roundedBox(metal, w*0.3, h, 0.02, 0, h/2, -d/2+0.01)`; two arms `cylinder(metal, 0.012, d-0.02, ±w*0.35, h*0.7, 0, 'z')`; cross bar `cylinder(metal, 0.012, w*0.7, 0, h*0.7, d/2-0.012, 'x')`.
   - `tall-cupboard` "Tall cupboard" 0.8×0.4×2.0 / 420 / `body: plaster-white, front: plaster-white, handle: metal-brass` / `againstWall: true` —
     `buildCabinet(ctx, { doors: 2, drawers: 0, handle: 'knob', plinth: 0.08 })`.
3. `src/catalog/entries/office.ts` — append, `category: 'office'`:
   - `printer` "Printer" 0.45×0.4×0.25 / 180 / `body: paint-charcoal, metal: steel-brushed` — body box to `h*0.8`; paper tray `roundedBox(metal, w*0.6, 0.01, d*0.3, 0, h*0.85, -d*0.3)`; output lip `roundedBox(metal, w*0.7, h*0.1, 0.01, 0, h*0.95, d/2-0.005)`.
   - `bookshelf-tall` "Tall bookshelf" 0.8×0.3×2.4 / 390 / `frame: walnut-planks, shelf: walnut-planks` — `buildShelfUnit(ctx, { shelves: 6, backPanel: true })`.
   - `desk-monitor-arm` "Desk with monitor arm" 1.4×0.7×1.15 / 560 / `top: oak-planks, legs: metal-black, metal: aluminium-brushed, screen: metal-black` /
     `surface: { height: 0.74 }` — desk top at `0.74·(h/1.15)`: `roundedBox(top, w, 0.03, d, 0, hTop-0.015, 0)` with `hTop = h*0.643`; `fourLegs(legs, w, d, hTop-0.03, 0.02)`;
     arm post `cylinder(metal, 0.02, h-hTop-0.02, 0, hTop+(h-hTop)/2, -d*0.4)`; screen `roundedBox(screen, w*0.45, (h-hTop)*0.7, 0.02, 0, h-(h-hTop)*0.35, -d*0.3, 0.004)`.
   - `pedestal-drawers` "Drawer pedestal" 0.42×0.5×0.6 / 160 / `body: plaster-white, front: plaster-white, handle: metal-black` — `buildCabinet(ctx, { doors: 0, drawers: 3, handle: 'bar', plinth: 0.03 })`.
4. `src/catalog/index.ts` — the `storage` import.
5. `src/ui/inspector/sections/params.tsx:24-29` — after `found.params[key] = value` add
   `if (found.catalogId === 'wardrobe-modular' && key === 'width') found.size.w = value === 'Narrow 100' ? 1.0 : value === 'Wide 200' ? 2.0 : 1.5`.
6. `src/i18n/en.ts`, `pt.ts` — 9 `catalog.<id>` keys (pt: Roupeiro modular, Estante aberta, Estante de garagem,
   Suporte de bicicleta, Armário alto, Impressora, Estante alta, Secretária com braço de monitor, Bloco de gavetas),
   params and options from Context, slot key `'Screen'`/`'Ecrã'` if missing.

## Tests to add
- `tests/catalog/storageOffice.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/builders` green.
- `grep -c "id: '" src/catalog/entries/storage.ts` prints `5`; `grep -c "id: '" src/catalog/entries/office.ts` prints `10`.

## Out of scope / forbidden
- Do not change existing entries, tests or strings. No lighting entries (c11).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
