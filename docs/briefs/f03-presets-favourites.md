# f03 — Colourway presets, favourites, "Apply to all"

**Epic:** features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** c01 (`presets` field), f01 (`SwatchPicker`)
**Time box:** ≤ 20 min of agent work

## Goal
Eight popular pieces ship with named colourways. A library card shows them as small chips;
clicking a chip places the item already in that colourway, and the item inspector offers the
same chips to switch later. Players can star materials and presets; starred ones appear in a
"Favourites" group at the top of the swatch grid and first on the card. "Apply to all Dining
chair" copies the selected item's materials to every item of the same kind on the level.

## Context the implementer needs
- `CatalogEntry.presets?: { id: string; name: string; slots: Record<string, MaterialRef> }[]`
  (`src/catalog/types.ts`, c01). Slots per entry (verified): `sofa-3`, `sofa-2`
  `{ fabric, legs }`; `armchair` `{ fabric, legs }`; `bed-double` `{ linen, frame }`;
  `dining-table`, `coffee-table` `{ top, legs }`; `dining-chair` `{ seat, frame }`; `wardrobe` `{ body, handle }`.
- Placement: `src/tools/placeItem.ts:21-25` `beginPlace(id)`, `onPointerDown` lines 85-111 copies
  `entry.materialSlots` into `materials` (line 104). Library card: `src/ui/LibraryDrawer.tsx:68-85`.
- Inspector: `src/ui/inspector/sections/item.tsx` (slot pickers at 90-115; `patchLevel` from
  `../fields`). `selectActiveLevel`, `useStore` from `src/store`.
- Swatch grid: `src/ui/SwatchPicker.tsx` (f01) — groups "Recent" then categories; `recentMaterials.ts`
  is the storage pattern to copy (`localStorage`, `subscribe`, `useSyncExternalStore`).
- Material ids used below exist in `src/materials/library.ts`: `fabric-linen`, `fabric-velvet-green`,
  `velvet-rust`, `boucle`, `leather-tan`, `leather-black`, `walnut-planks`, `oak-planks`,
  `oak-whitewashed`, `metal-black`, `metal-brass`, `marble`, `paint-sage`, `paint-navy`, `chrome`.
- Preset names are user-facing and translated through `tr(preset.name)`; the coverage test
  (`tests/i18n/coverage.test.ts:128`) does not know about presets, so add a check to the new test.

## Steps
1. `tests/catalog/presets.test.ts` (new): every `presets[]` entry across the catalog has a unique
   `id` within its entry, every `slots` key exists in `entry.materialSlots`, every material id
   resolves with `getMaterialDef`, and `en` / `pt` have the preset `name` key with `pt !== en`.
   `tests/ui/favourites.test.ts` (node, stub `localStorage` with a Map): `toggleFavouriteMaterial('oak-planks')`
   twice → absent; `isFavouriteMaterial`; `toggleFavouritePreset('sofa-3', 'rust')` stores `'sofa-3:rust'`;
   invalid JSON in storage → empty favourites, no throw. `tests/model/applyToAll.test.ts`:
   `applyMaterialsToAll(level, sourceItemId)` copies `materials` (deep) to every item with the
   same `catalogId`, skips other ids and locked items, returns the count, and deletes `prop`
   (c10's `touchItem`, if present; otherwise just copy).
2. `src/catalog/entries/basic.ts` and `living.ts` — add `presets` (name / slots):
   - `sofa-3`, `sofa-2`: `linen` "Linen" `{ fabric: fabric-linen, legs: walnut-planks }`; `forest` "Forest velvet" `{ fabric: fabric-velvet-green, legs: metal-black }`; `rust` "Rust velvet" `{ fabric: velvet-rust, legs: walnut-planks }`; `tan` "Tan leather" `{ fabric: leather-tan, legs: metal-black }`.
   - `armchair`: `forest` "Forest velvet" `{ fabric: fabric-velvet-green, legs: walnut-planks }`; `boucle` "Bouclé wool" `{ fabric: boucle, legs: oak-planks }`; `black` "Black leather" `{ fabric: leather-black, legs: metal-black }`.
   - `bed-double`: `linen` "Linen" `{ linen: fabric-linen, frame: walnut-planks }`; `pale` "Pale oak" `{ linen: fabric-linen, frame: oak-whitewashed }`; `navy` "Navy" `{ linen: paint-navy, frame: metal-black }`.
   - `dining-table`: `oak` "Oak" `{ top: oak-planks, legs: walnut-planks }`; `marble` "Marble top" `{ top: marble, legs: metal-black }`; `pale` "Pale oak" `{ top: oak-whitewashed, legs: oak-whitewashed }`.
   - `coffee-table`: `oak` "Oak" `{ top: oak-planks, legs: metal-black }`; `marble` "Marble top" `{ top: marble, legs: metal-brass }`.
   - `dining-chair`: `linen` "Linen" `{ seat: fabric-linen, frame: oak-planks }`; `sage` "Sage" `{ seat: paint-sage, frame: oak-planks }`; `black` "Black leather" `{ seat: leather-black, frame: metal-black }`.
   - `wardrobe`: `oak` "Oak" `{ body: oak-planks, handle: metal-brass }`; `pale` "Pale oak" `{ body: oak-whitewashed, handle: chrome }`; `navy` "Navy" `{ body: paint-navy, handle: metal-brass }`.
   Use `ref()` for each material. The first preset equals the entry's `materialSlots`.
3. `src/ui/favourites.ts` (new): key `nestwright:favourites`, shape `{ materials: string[]; presets: string[] }`
   (`presets` entries are `${catalogId}:${presetId}`). Exports `favourites()`, `isFavouriteMaterial(id)`,
   `toggleFavouriteMaterial(id)`, `isFavouritePreset(catalogId, presetId)`, `toggleFavouritePreset(catalogId, presetId)`,
   `subscribeFavourites(listener)`. Same error handling as `recentMaterials.ts`.
4. `src/model/style.ts` — create if f04 has not (f04 also writes here; both export distinct functions):
   `export function applyMaterialsToAll(level: Level, sourceId: string): number`.
5. `src/tools/placeItem.ts` — `beginPlace(id: string, presetId?: string)`; store `presetId` in a module
   variable; in `onPointerDown` line 104 use `entry.presets?.find((p) => p.id === presetId)?.slots ?? entry.materialSlots`.
   Clear it in `deactivate`.
6. `src/ui/LibraryDrawer.tsx` — under the card name (line 76) render, when `entry.presets`,
   `<div className="preset-chips">` with one `<button type="button" className="chip" title={tr(p.name)} aria-label={tr(p.name)} style={{ background: swatchColor(primarySlot(p)) }} onClick={(e) => { e.stopPropagation(); beginPlace(entry.id, p.id) }} />`
   per preset, favourites first (`isFavouritePreset`). `primarySlot(p)` is the first slot value's id.
   Chips are 14 px circles (`styles.css`: `.preset-chips { display:flex; gap:4px; justify-content:center; margin-top:4px }`,
   `.chip { width:14px; height:14px; border-radius:50%; border:1px solid rgba(0,0,0,.35); padding:0 }`, `.chip.fav { outline:2px solid var(--sand) }`).
7. `src/ui/inspector/sections/item.tsx` — above the slot pickers: when `entry?.presets`, a row of
   the same chips with a caption `tr(p.name)` and a star button (`aria-label={tr('Favourite')}`,
   text `★`/`☆`) toggling `toggleFavouritePreset`; clicking a chip runs
   `patchLevel('Preset', (draft) => { const found = …; if (found) found.materials = clone(p.slots) })`.
   Below the slots add `<button type="button" onClick={() => patchLevel('Apply to all', (draft) => { applyMaterialsToAll(draft, id) })}>{tr('Apply to all {name}', { name })}</button>`
   where `name = catalogName(language, entry.id, entry.name)`; hide it when the level has only one item of that `catalogId`.
8. `src/ui/SwatchPicker.tsx` — a "Favourites" group before "Recent" (heading `tr('Favourites')`),
   and on every swatch cell a small star toggle button (`aria-label={tr('Favourite')}`) calling
   `toggleFavouriteMaterial(def.id)`; subscribe with `useSyncExternalStore(subscribeFavourites, favourites)`.
9. `src/i18n/en.ts`/`pt.ts`: `'Linen'` (en.ts:621) and `'Oak'` (en.ts:431) already exist — reuse
   them. Add: `'Forest velvet'`/`'Veludo verde-escuro'`, `'Rust velvet'`/`'Veludo ferrugem'`,
   `'Tan leather'`/`'Pele castanha'`, `'Bouclé wool'`/`'Lã bouclé'` (the preset name in step 2 is
   "Bouclé wool", since a bare "Bouclé" would be identical in pt), `'Black leather'`/`'Pele preta'`,
   `'Pale oak'`/`'Carvalho claro'`, `'Navy'`/`'Azul-marinho'`, `'Marble top'`/`'Tampo em mármore'`,
   `'Sage'`/`'Salva'`; UI: `'Favourites'`/`'Favoritos'`, `'Favourite'`/`'Favorito'`,
   `'Apply to all {name}'`/`'Aplicar a todos: {name}'`, `'Preset'`/`'Predefinição'`.

## Tests to add
- `tests/catalog/presets.test.ts`, `tests/ui/favourites.test.ts`, `tests/model/applyToAll.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/ui tests/model tests/i18n tests/tools` green.
- In the app: Living tab → "Three-seat sofa" card shows 4 chips; clicking the rust chip and the
  plan places a rust sofa; the inspector shows the chips, a star, and "Apply to all Three-seat sofa"
  when two sofas exist; starring `oak-planks` puts it in a Favourites group in every swatch grid.

## Out of scope / forbidden
- No copy/paste style (f04). No presets on entries other than the eight listed.
- Do not edit existing tests or user-facing strings; new strings only as listed.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
