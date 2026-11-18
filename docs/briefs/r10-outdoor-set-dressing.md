# r10 — Outdoor set dressing: garden props and "Dress garden"

**Epic:** realism **Release:** v0.23.0 **Owner model:** grok-4.7-medium
**Depends on:** r01 (content-v4 pack carries the scanned models; procedural fallbacks make
this brief shippable without it)
**Time box:** ≤ 20 min of agent work

## Goal
A generated garden is no longer bare lawn and paving. Eight new `outdoor` catalog entries
(garden chair, picnic table, planter, hose reel, wheelie bin, washing line, watering can,
wheelbarrow) exist with procedural builds, and `content/sources.json` points Poly Haven
CC0 models at them. A pure `dressGarden(project, seed)` places terrace furniture on the
patio, bins by the garage door and planters by the front door; the Outside panel gets a
**Dress garden** button that runs it. Same seed, same dressing; running it twice replaces
the previous dressing.

## Context the implementer needs
- Catalog: `src/catalog/entries/outdoor.ts` (entries `garden-sofa`, `lounger`, `parasol`,
  `bbq`, `bench-garden`, `bicycle`, … with `materialSlots`, `defaultSize`, `price`,
  `build(ctx)` from `../parts`: `roundedBox`, `cylinder`, `fourLegs`, `torusRing`, `group`,
  `matOf`). `tests/catalog/catalog.test.ts` builds every entry to `ctx.size` and needs a
  literal `id: '...'`. Entry names need `en.ts` and `pt.ts` strings (`'Garden sofa'` at en.ts:844).
- Content: `content/sources.json` model entry shape (`kind: 'model'`, `provider: 'polyhaven'`,
  `sourceId`, `resolution: '1k'`, `licence: 'CC0'`, `targets: { catalogId }`, optional
  `maxTriangles`, `rotateY`, `notes`). `scripts/content/lib/validate.mjs` rejects a
  `catalogId` not in the catalog. `scripts/content/model-picks.md` logs picks.
  Poly Haven API: `https://api.polyhaven.com/assets?t=models&c=props`, `…&c=furniture`,
  `…&c=outdoor` (JSON: slug → `{ name, categories, tags }`); `https://api.polyhaven.com/info/<slug>`.
- Model: `src/model/terrain.ts:1145` `generateGarden(project, seed)` (uses `groundLevel`,
  `frontDoor`, `placedOpening`, `onPatio`, `detectRooms`, `planCentroid`; these are
  module-private — export the ones you need). `src/model/` is pure: no three, no catalog
  import. `Item` shape in `src/model/types.ts:172–190`; `newId('item')` from
  `src/model/ids.ts` (as `src/templates/build.ts:3,105` uses it). `tests/model/gardenLayout.test.ts:13–41` has the `house()` fixture.
- UI: `src/ui/panels/OutsidePanel.tsx:218–225` "Flatten under house" button pattern;
  `useStore.getState().apply(label, recipe)`.

## Steps
1. **Tests first** — `tests/model/dressGarden.test.ts` and the catalog additions (see
   below). Fails.
2. `src/catalog/entries/outdoor.ts`: add entries (id, defaultSize w×d×h m, price €, slots):
   `garden-chair` 0.55×0.58×0.85 €45 `{ frame: 'metal-black', seat: 'fabric-linen' }`;
   `picnic-table` 1.8×1.5×0.75 €260 `{ wood: 'decking' }`;
   `planter` 0.5×0.5×0.45 €60 `{ pot: 'terracotta-floor-tile', soil: 'bark-mulch', leaf: 'grass' }`;
   `hose-reel` 0.45×0.3×0.5 €40 `{ body: 'metal-black', hose: 'paint-sage' }`;
   `wheelie-bin` 0.58×0.72×1.07 €35 `{ body: 'paint-charcoal', lid: 'paint-charcoal' }`;
   `washing-line` 2.2×2.2×1.9 €55 `{ pole: 'aluminium-brushed', line: 'plaster-white' }`;
   `watering-can` 0.35×0.18×0.3 €14 `{ body: 'metal-brass' }`;
   `wheelbarrow` 1.4×0.6×0.6 €90 `{ tray: 'metal-black', frame: 'steel-black' }`.
   Each `build` fills exactly `ctx.size` (box/cylinder parts; the catalog test checks bounds).
   Tags: `['seat']`, `['table']`, `['plant']`, `['tool']`, `['bin']`, `['laundry']`, `['tool']`, `['tool']`.
3. `src/i18n/en.ts`/`pt.ts`: `Garden chair`/`Cadeira de jardim`, `Picnic table`/`Mesa de piquenique`,
   `Planter`/`Floreira`, `Hose reel`/`Enrolador de mangueira`, `Wheelie bin`/`Contentor do lixo`,
   `Washing line`/`Estendal`, `Watering can`/`Regador`, `Wheelbarrow`/`Carrinho de mão`,
   `Dress garden`/`Decorar o jardim`.
4. `content/sources.json` + `scripts/content/model-picks.md`: query the three Poly Haven
   listings (if the sandbox has no network, write the candidate table from the slugs you
   know and mark "unverified"; Claude verifies at re-pack). Record ≥ 20 candidate slugs
   with name and target in `model-picks.md` (section "Outdoor props (r10)"), then add one
   source entry per new catalog id where a match exists (`resolution: '1k'`,
   `maxTriangles: 30000`, `rotateY` so the front faces +Z). Unmatched ids keep the
   procedural build; say which.
5. `src/model/garden.ts` (new, pure): `export const GARDEN_DRESSING = 'garden-dressing'`;
   `export const DRESSING_SIZES: Record<string, { w; d; h }>` duplicating the eight
   `defaultSize`s (the model may not import the catalog);
   `export function dressGarden(project: Project, seed: number): void`:
   remove items with `params[GARDEN_DRESSING] === true` from the ground level; with the
   hashed seed, place on the ground level: 2 `garden-chair` + 1 `picnic-table` at the
   patio (first grid sample where `onPatio` is true, chairs 0.9 m either side of the
   table, rotated to face it); 1 `wheelie-bin` 1.2 m beside the garage door's outside
   point when a `garage-door` exists; 2 `planter` 0.6 m either side of the front door's
   outside point; 1 `watering-can` beside a planter; 1 `washing-line` 3 m behind the patio
   when `onPatio` is false there. Every item: `elevation 0`, `materials {}`,
   `params: { [GARDEN_DRESSING]: true }`, `size` from `DRESSING_SIZES`. Skip any
   position inside the house footprint (`pointInPolygon` over `detectRooms` polygons).
6. Export from `terrain.ts` what `garden.ts` needs (`onPatio`, `frontDoor`, `placedOpening`,
   `groundLevel`) without changing their bodies.
7. `OutsidePanel.tsx`: next to "Flatten under house", `<button type="button" onClick={() => useStore.getState().apply('Dress garden', (draft) => dressGarden(draft, Date.now() >>> 0))}><T k="Dress garden" /></button>`.

## Tests to add
- `tests/catalog/catalog.test.ts` runs as is (new entries build to size, unique ids).
- `tests/model/dressGarden.test.ts` (copy `house()` from gardenLayout):
  after `generateGarden(p, 3); dressGarden(p, 3)`: items tagged `GARDEN_DRESSING` ≥ 5;
  exactly 2 `garden-chair` and 1 `picnic-table` with `onPatio(...)` true for each position;
  with `house({ garage: true })` one `wheelie-bin` within 2.5 m of the garage door point;
  2 `planter`s within 1.5 m of the front door point; no dressed item inside the 8×6 footprint;
  `dressGarden(p, 3)` twice leaves the same count; `JSON.stringify` of the dressed items
  is identical for the same seed and differs for seed 4.
- `tests/catalog/dressingSizes.test.ts`: every key of `DRESSING_SIZES` is a catalog entry
  whose `defaultSize` deep-equals it.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/model tests/i18n tests/content` green;
  `node scripts/content/validate.mjs` reports no `catalogId … is not in the catalog`.
- `npm run dev` → family template → Outside panel → Dress garden: chairs and a table on the
  patio, a bin by the garage, planters at the door; Undo removes them.

## Out of scope / forbidden
- No plants, no lighting, no changes to `generateGarden`'s splat or plant output.
- Do not edit existing tests or existing strings. Do not run the content pipeline.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not start a dev server for tests. Do not commit, push or merge. No new dependencies.
