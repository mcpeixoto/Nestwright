# u10 — Library: icon tabs, global search, favourites, recents, scanned thumbnails

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u06, u07
**Time box:** ≤ 20 min of agent work

## Goal
The furniture library has icon tabs per category, a search box that looks across every
category, an `Add your own ▾` menu (Import model, From photo…), a small/large card toggle,
Favourites and Recently used tabs remembered in localStorage, and thumbnails rendered from the
scanned model when the content pack has one.

## Context the implementer needs
- `src/ui/LibraryDrawer.tsx` (94 lines): `DRAWER_CATEGORIES` from `CATEGORIES` + `imported`;
  search filters only `listEntries(category)`; two loose buttons `Import model` / `From photo…`;
  `.cats` buttons; `.thumbs` grid of `.thumb` cards calling `beginPlace(entry.id)`.
- `src/catalog/types.ts` L54–66 `CATEGORIES`: living, dining, bedroom, kitchen, bathroom, office,
  outdoor, lighting, decor, plants, structure. `src/i18n/catalog.ts` `catalogName`, `categoryName`.
- `src/catalog/thumbnails.ts` `renderOne` L77–111 builds `entry.build(...)` into a shared stage;
  `forgetThumb(id)`, `requestThumb(id, urgent)`, `subscribeThumbs`.
- Scanned models: `src/catalog/models/registry.ts` `modelFor(catalogId)` (returns a template or
  null and starts loading), `subscribeModels(listener)`; `src/builders/items.ts` L48–57 shows how a
  template becomes an object: `buildModel(template, size, hasLight)` from `src/catalog/models`,
  then `occupy(built, size)`.
- `src/tools/icons.ts` `icon(body)` SVG helper; `DropMenu` from `src/ui/topbar/DropMenu.tsx` (u06).
- `src/io/importModel.ts` `importModelFile`, `removeImportedModel`, `catalogIdForAsset`;
  `PhotoFurnitureDialog`.
- Strings `Search furniture`, `Import model`, `From photo…`, `My models`, `Nothing in this category matches.`,
  `Remove {name}` exist. New keys go in `en.ts` + `pt.ts`.

## Steps
1. `tests/ui/librarySearch.test.ts` (new, node): import `searchEntries` from `src/ui/library/search`;
   with entries `[{ id: 'sofa-3', name: 'Three-seat sofa', category: 'living', tags: ['sofa'] },
   { id: 'bed-1', name: 'Double bed', category: 'bedroom', tags: ['bed'] }]` (cast to `CatalogEntry`),
   `searchEntries(entries, 'living', '', 'en')` returns only the sofa; `searchEntries(entries, 'living', 'bed', 'en')`
   returns the bed (search ignores the tab); `'sofá'` matches the sofa in `'pt-PT'` via `catalogName`
   when the pt catalog has it, otherwise falls back to the English name (assert the sofa is found for `'sofa'`).
2. `tests/ui/libraryRecent.test.ts` (new, node): import `loadLibraryPrefs`, `toggleFavourite`,
   `noteRecent` from `src/ui/library/prefs` with an in-memory `Storage` stub passed as the
   second argument: defaults `{ favourites: [], recent: [], cardSize: 'small' }`; `toggleFavourite('a')`
   twice adds then removes; `noteRecent` puts the newest first, dedupes, caps at 12; a corrupt JSON
   string yields the defaults.
3. `src/ui/library/search.ts` (new): `searchEntries(entries, category, needle, language)` — empty
   needle → `entries.filter(e => e.category === category)` (for `favourites`/`recent` the caller
   passes the already-filtered list); non-empty → every entry whose `catalogName(language, id, name)`,
   `name` or any tag includes the lower-cased needle.
4. `src/ui/library/prefs.ts` (new): key `nestwright:library`, `interface LibraryPrefs { favourites: string[]; recent: string[]; cardSize: 'small' | 'large' }`,
   `loadLibraryPrefs(storage = localStorage)`, `saveLibraryPrefs(prefs, storage)`, `toggleFavourite(id, storage)`,
   `noteRecent(id, storage)`, `setCardSize(size, storage)`, plus `subscribeLibraryPrefs`/`useLibraryPrefs`
   (module store, publishes after each write). All storage access in try/catch.
5. `src/ui/library/icons.ts` (new): `CATEGORY_ICONS: Record<string, string>` with one `icon(...)`
   per category plus `favourites` (star), `recent` (clock) and `imported` (box). Simple 1–3 path glyphs.
6. `src/ui/LibraryDrawer.tsx`:
   - tabs: `favourites`, `recent`, then `CATEGORIES`, then `imported`; each `button.cat` shows the
     icon and, as `aria-label` and `Tooltip`, `categoryName(language, id)` / `Favourites` /
     `Recently used` / `My models`.
   - search input unchanged; the entries come from `searchEntries(base, category, needle, language)`
     where `base` is `listEntries()` for normal tabs, `prefs.favourites.map(getEntry)` or
     `prefs.recent.map(getEntry)` (filter nulls) for the two special tabs. With a needle show a small
     `.cat-badge` with the category name on each card.
   - header row: `<DropMenu label={tr('Add your own')} items=[Import model → importModelFile(), From photo… → setPhotoOpen(true)] />`
     and a card-size toggle button (`aria-pressed={cardSize === 'large'}`, label `Large cards`).
   - cards: `.thumbs.small|large`; a star button per card (`aria-pressed`, `aria-label={tr('Favourite {name}')}`,
     `toggleFavourite(entry.id)`); `beginPlace` wrapped as `() => { noteRecent(entry.id); beginPlace(entry.id) }`.
   - scanned thumbnails: `useSyncExternalStore(subscribeModels, modelsRevision)` where
     `modelsRevision` is a counter you add to `src/catalog/models/registry.ts` (increment in `emit`);
     in an effect, for each visible entry with `modelFor(entry.id)` non-null and not yet marked,
     call `forgetThumb(id)` then `requestThumb(id, true)` once (track in a `Set` ref).
7. `src/catalog/thumbnails.ts` `renderOne`: before `entry.build(...)`, `const template = modelFor(id)`;
   if present, `built = new THREE.Group(); built.add(buildModel(template, entry.defaultSize, !!entry.light)); occupy(built, entry.defaultSize)`,
   else the existing procedural path. Imports from `./models` and `./parts`.
8. `src/ui/styles.css`: `.library .cats { gap: 2px; } .library .cats button { padding: 4px; } .thumbs.large { grid-template-columns: 1fr; } .thumb .fav { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; padding: 0; } .cat-badge { font-size: 10px; color: var(--muted); }`.
9. Strings `en.ts` + `pt.ts`: `Favourites` → `Favoritos`; `Recently used` → `Usados recentemente`;
   `Add your own` → `Adicionar os seus`; `Large cards` → `Cartões grandes`; `Favourite {name}` → `Favorito {name}`;
   `No favourites yet. Press the star on a piece.` → `Ainda sem favoritos. Carregue na estrela de uma peça.`

## Tests to add
- `tests/ui/librarySearch.test.ts`, `tests/ui/libraryRecent.test.ts` as above.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/catalog tests/i18n` green.
- `npm run test:e2e -- tests/e2e/portuguese.spec.ts` green (the `Estar` category button must
  keep its accessible name via `aria-label`).
- `npm run dev` with the content pack fetched: search `chair` from any tab lists chairs from
  several categories; the arm chair thumbnail is the scanned model; star a piece, reload, it is
  under Favourites.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings.
- Do not change `beginPlace`, the catalog entries or the content pipeline.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
