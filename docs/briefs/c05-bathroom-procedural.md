# c05 — Bathroom: 10 procedural entries

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c02, c08
**Time box:** ≤ 20 min of agent work

## Goal
The Bathroom tab gains a bidet, mirror cabinet, towel rail, wall shelf, a vanity unit whose
width preset (60/90/120) sets its doors and basins, a corner shower, a walk-in shower screen,
a corner bath, a toilet-roll holder and a laundry basket. Existing items (`toilet`, `bathtub`,
`shower`, `washbasin`, `double-washbasin`, `freestanding-tub`, `walk-in-shower`, `wc-wall-hung`,
`towel-radiator`, `bathroom-cabinet`) stay as they are.

## Context the implementer needs
- Entry format and wall-mount fields: `src/catalog/entries/bathroom.ts:87-127`
  (`towel-radiator` with `mount: 'wall', mountHeight: 0.25`; `bathroom-cabinet` with `mountHeight: 1.35`).
- Params: `src/catalog/types.ts:4-13` (`ParamDef`), an enum example is absent, so use:
  `{ key: 'width', label: 'Width preset', kind: 'enum', options: ['Narrow 60', 'Standard 90', 'Wide 120'], default: 'Standard 90' }`.
  `src/ui/inspector/sections/params.tsx:24-29` — `commit(key, value)` writes `found.params[key]`.
- Helpers: `src/catalog/parts.ts` (`roundedBox`, `cylinder`, `lathe(parent, mat, slot, profile, w, h, d, x, y, z)`
  line 189, `ellipsoid` 217, `glassPane` 259, `torusRing` 166, `handle` 143); families
  `buildCabinet` from `src/catalog/families/index.ts` (c08).
- Materials used: `plaster-white`, `chrome`, `glass`, `frosted-glass`, `mirror`, `oak-planks`,
  `marble`, `rattan`, `fabric-linen`, `tile-white`.
- i18n: `catalog.<id>` keys in `en.ts`/`pt.ts` (after the last `'catalog.*'`); param label
  `'Width preset'` and its options need keys too (`tests/i18n/coverage.test.ts:135-139`).

## Steps
1. `tests/catalog/bathroom.test.ts` (new): import `'../../src/catalog'`; assert the 10 ids exist
   with `category === 'bathroom'` and `price > 0`; `mirror-cabinet`, `towel-rail`,
   `bathroom-shelf`, `toilet-roll-holder` have `mount === 'wall'` with the `mountHeight` below;
   `vanity-unit` has a param `width` with the three options; building `vanity-unit` at
   `defaultSize` with `params: { width: 'Wide 120' }` yields 2 meshes with `userData.part === 'basin'`,
   with `'Narrow 60'` exactly 1.
2. `src/catalog/entries/bathroom.ts` — append (name / w×d×h / € / slots / mount / recipe):
   - `bidet` "Bidet" 0.36×0.55×0.4 / 260 / `body: plaster-white, metal: chrome` / `againstWall: true` —
     `ellipsoid(body, w, h*0.5, d, 0, h*0.75, 0)` on a pedestal `roundedBox(body, w*0.5, h*0.5, d*0.5, 0, h*0.25, -d*0.1)`; tap `cylinder(metal, 0.01, 0.06, 0, h-0.03, -d*0.3)`.
   - `mirror-cabinet` "Mirror cabinet" 0.6×0.14×0.7 / 190 / `body: plaster-white, mirror: mirror` / `mount: 'wall', mountHeight: 1.2` —
     body box; mirror pane `roundedBox(mirror, w-0.02, h-0.02, 0.006, 0, h/2, d/2-0.003, 0)`.
   - `towel-rail` "Towel rail" 0.6×0.08×0.06 / 45 / `metal: chrome` / `mount: 'wall', mountHeight: 1.1` —
     two brackets `cylinder(0.01, d-0.01, ±(w/2-0.03), h/2, 0, 'z')`; bar `cylinder(0.01, w, 0, h/2, d/2-0.01, 'x')`.
   - `bathroom-shelf` "Bathroom shelf" 0.6×0.14×0.04 / 60 / `shelf: glass, metal: chrome` / `mount: 'wall', mountHeight: 1.0` —
     glass pane `glassPane(w, 0.008, d, 0, h-0.004, 0, 0.35)`; two brackets.
   - `vanity-unit` "Vanity unit" 0.9×0.5×0.85 / 540 / `body: oak-planks, top: marble, metal: chrome` / `againstWall: true` /
     params `[width]` — doors = `Narrow 60 → 1`, `Standard 90 → 2`, `Wide 120 → 2`; basins = `Wide 120 → 2` else 1;
     `buildCabinet(ctx', { doors, drawers: 0, handle: 'bar', plinth: 0.06, slots: { body: 'body', front: 'body', handle: 'metal' } })`
     with `ctx'.size.h = h - 0.04`; top slab `roundedBox(top, w, 0.04, d, 0, h-0.02, 0)`; basin(s)
     `ellipsoid(body, min(w*0.4, 0.4), 0.02, d*0.6, x_i, h-0.01, 0)` with `userData.part = 'basin'`.
   - `corner-shower` "Corner shower" 0.9×0.9×2.0 / 680 / `tray: tile-white, glass: glass, metal: chrome` —
     tray `roundedBox(tray, w, 0.05, d, 0, 0.025, 0)`; two glass panes on the front and right:
     `glassPane(glass, w, h-0.05, 0.008, 0, 0.05+(h-0.05)/2, d/2-0.004)` and `glassPane(glass, 0.008, h-0.05, d, w/2-0.004, …, 0)`;
     rail `cylinder(metal, 0.01, w, 0, h-0.02, d/2-0.004, 'x')`.
   - `shower-screen` "Walk-in shower screen" 1.0×0.04×2.0 / 320 / `glass: glass, metal: chrome` —
     one pane `glassPane(glass, w, h, 0.008, 0, h/2, 0, 0.3)`; support bar `cylinder(metal, 0.01, d, 0, h*0.95, 0, 'z')`.
   - `corner-bath` "Corner bath" 1.4×1.4×0.6 / 1150 / `body: plaster-white, metal: chrome` —
     `roundedBox(body, w, h, d, 0, h/2, 0, 0.03)` with a basin recess `roundedBox(tile-white→body, w*0.8, 0.01, d*0.8, -w*0.05, h-0.005, d*0.05)`; tap at the back corner.
   - `toilet-roll-holder` "Toilet-roll holder" 0.15×0.1×0.12 / 25 / `metal: chrome` / `mount: 'wall', mountHeight: 0.7` —
     bracket `cylinder(0.008, d-0.01, 0, h/2, 0, 'z')`; roll `cylinder(plaster-white→metal slot, min(w,h)/2, w*0.9, 0, h/2, d/2-0.01, 'x')`.
     Give the roll its own slot `paper: plaster-white` (slot label `'Paper'` exists).
   - `laundry-basket` "Laundry basket" 0.4×0.4×0.6 / 55 / `body: rattan, lid: fabric-linen` —
     `cylinder(body, 0.5, h-0.03, 0, (h-0.03)/2, 0)` scaled `(w, 1, d)`; lid `cylinder(lid, 0.5, 0.03, 0, h-0.015, 0)` scaled `(w, 1, d)`.
   Every entry: `tags` from `['sanitary']`, `['storage']`, `['shower']`, `['bath']` as fits.
3. `src/ui/inspector/sections/params.tsx:24-29` — after `found.params[key] = value`, add:
   `if (found.catalogId === 'vanity-unit' && key === 'width') found.size.w = value === 'Narrow 60' ? 0.6 : value === 'Wide 120' ? 1.2 : 0.9`.
4. `src/i18n/en.ts`, `pt.ts` — 10 `catalog.<id>` keys (pt: Bidé, Armário com espelho, Toalheiro,
   Prateleira de casa de banho, Móvel de lavatório, Duche de canto, Resguardo de duche,
   Banheira de canto, Porta-rolos, Cesto da roupa); `'Width preset': 'Width preset'` / `'Largura'`;
   options `'Narrow 60'`, `'Standard 90'`, `'Wide 120'` with pt `'Estreito 60'`, `'Normal 90'`, `'Largo 120'`
   (plain `'60 cm'` would be identical in pt and fail `coverage.test.ts:172`, which Grok may not edit).
   Slot keys to check/add: `'Tray'`/`'Base de duche'`, `'Lid'`/`'Tampa'`, `'Mirror'` (exists as a material name — reuse).

## Tests to add
- `tests/catalog/bathroom.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/builders` green.
- `npx vitest run tests/catalog/bathroom.test.ts` prints `passed`.
- `grep -c "id: '" src/catalog/entries/bathroom.ts` prints `18`.

## Out of scope / forbidden
- Do not change existing bathroom entries, tests or strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
