# c03 — New library categories: appliances, kids, laundry, hall, storage

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
The furniture library has five more tabs — Appliances, Kids, Laundry, Hall, Storage — each
with an icon, and the appliances and laundry machines that were filed under Kitchen and
Bathroom now live in their own tabs. Later briefs (c04–c07) fill the empty tabs.

## Context the implementer needs
- `src/catalog/types.ts:54-68` — `CATEGORIES` const array; `CatalogCategory` derives from it.
- `src/i18n/catalog.ts:28-40` — `CATEGORY_KEYS` maps category → `'category.<id>'` key.
- `src/i18n/en.ts:366-376` and `pt.ts:368-378` — the existing `'category.*'` strings.
- `src/ui/LibraryDrawer.tsx:13-18` — `DRAWER_CATEGORIES`; tab buttons at lines 60-66 render
  text only. `src/tools/icons.ts` exports `icon(svgInner)` (used in `placeItem.ts:73`); copy
  that pattern for tab icons.
- Entries to move (confirmed ids): `src/catalog/entries/kitchen.ts` — `fridge-tall` (line 178),
  `fridge-american` (194), `range-hood` (232), `microwave` (250), `coffee-machine` (266) →
  `appliances`. `src/catalog/entries/bathroom.ts` — `washing-machine` (129), `dryer` (146) →
  `laundry`. `kitchen-run`, `kitchen-l`, `kitchen-island`, `dining-island-stool` stay `kitchen`.
- `src/model/budget.ts:131` — `budgetCategoryKey` is about budget categories, not catalog
  categories; leave it.
- `tests/i18n/coverage.test.ts:134` fails for a category with no `categoryNameKey`.
- `LibraryDrawer.tsx:23` — the default tab is `'living'`; keep it.

## Steps
1. `tests/catalog/categories.test.ts` (new). Import `'../../src/catalog'`, `CATEGORIES`,
   `listEntries`, `getEntry`, `categoryNameKey`. Assert: `CATEGORIES` contains
   `'appliances', 'kids', 'laundry', 'hall', 'storage'` and still starts with `'living'`;
   every entry's `category` is in `CATEGORIES`; `getEntry('washing-machine')!.category === 'laundry'`,
   `getEntry('dryer')!.category === 'laundry'`; each of `fridge-tall, fridge-american, range-hood,
   microwave, coffee-machine` has `category === 'appliances'`; `listEntries('kitchen')` has
   exactly 4 entries; `categoryNameKey(c)` is defined for every `c` in `CATEGORIES`; and
   `CATEGORY_ICONS` (step 5) has a key for every category plus `'imported'`.
2. `src/catalog/types.ts` — `CATEGORIES` becomes, in this order:
   `'living', 'dining', 'bedroom', 'kitchen', 'appliances', 'bathroom', 'laundry', 'kids',
   'office', 'hall', 'storage', 'outdoor', 'lighting', 'decor', 'plants', 'structure'`.
3. `src/catalog/entries/kitchen.ts` and `bathroom.ts` — change the `category:` of the seven
   entries listed above. Do not move them between files.
4. `src/i18n/catalog.ts` — add to `CATEGORY_KEYS`: `appliances: 'category.appliances'`,
   `kids: 'category.kids'`, `laundry: 'category.laundry'`, `hall: 'category.hall'`,
   `storage: 'category.storage'`.
5. `src/ui/libraryIcons.ts` (new) — `export const CATEGORY_ICONS: Record<string, string>`
   with one 24×24 inline SVG string per category id and `'imported'`, built with
   `icon()` from `src/tools/icons.ts` (stroke-only, `fill="none"`, stroke-width 1.6):
   living = sofa outline, dining = table + two chairs, bedroom = bed, kitchen = pan,
   appliances = rounded rect with a circle (washing-drum style, used for fridge/oven family),
   bathroom = bathtub, laundry = rect with circle and two dots, kids = teddy-bear head
   (circle + two ear circles), office = desk + monitor, hall = coat hook (hook + base line),
   storage = three stacked rects, outdoor = tree, lighting = bulb, decor = picture frame,
   plants = leaf, structure = radiator fins, imported = cube.
6. `src/ui/LibraryDrawer.tsx` — tab buttons (lines 61-65) render
   `<span className="cat-icon" dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[item.id] ?? '' }} />`
   before the label, and get `title={label}`. `src/ui/styles.css:388-389` holds `.library .cats`;
   add after line 389: `.cat-icon { display:inline-block; width:16px; height:16px; margin-right:6px;
   vertical-align:-3px }` and `.cat-icon svg { width:100%; height:100% }`.
7. `src/i18n/en.ts` — after `'category.structure'` add `'category.appliances': 'Appliances'`,
   `'category.kids': 'Kids'`, `'category.laundry': 'Laundry'`, `'category.hall': 'Hall'`,
   `'category.storage': 'Storage'`. `pt.ts`: `'Eletrodomésticos'`, `'Crianças'`, `'Lavandaria'`,
   `'Entrada'`, `'Arrumação'`.

## Tests to add
- `tests/catalog/categories.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/ui` green.
- `npx vitest run tests/catalog/categories.test.ts` prints `1 passed`.
- `grep -c "category: 'appliances'" src/catalog/entries/kitchen.ts` prints `5`;
  `grep -c "category: 'laundry'" src/catalog/entries/bathroom.ts` prints `2`.

## Out of scope / forbidden
- Do not add new entries (c04–c07). Do not rename ids or English names.
- Do not edit existing tests or user-facing strings; the five category strings are new.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
