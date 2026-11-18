# f01 — Material swatch picker: grid, search, recent

**Epic:** features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
Choosing a material for an item slot, a wall side or a room floor opens a proper swatch grid:
48 px swatches grouped by material category, each showing the procedural pattern (not just a
flat colour), a search box that filters by translated name, and a "Recent" row with the last
twelve picks. The same control replaces the current 22 px popup everywhere `MaterialPicker` is used.

## Context the implementer needs
- `src/ui/MaterialPicker.tsx` — the whole file (134 lines). Keep the exported signature
  `MaterialPicker({ value, onChange }: { value: MaterialRef; onChange: (next: MaterialRef) => void })`
  and the tint / brightness / scale controls (lines 75-107); replace only the popup at lines 108-131.
  Used by `src/ui/inspector/sections/item.tsx:92`, `wall.tsx`, `room.tsx:85`, and others
  (`grep -rn "MaterialPicker" src/ui`).
- Library: `src/materials/library.ts` — `MATERIALS: MaterialDef[]` (`id, name, category, color, pattern`),
  `MATERIAL_CATEGORIES`, `getMaterialDef(id)`, `swatchColor(id)` (line 152). 12 categories, 99 materials.
- Pattern thumbnails: `src/materials/textures.ts:276` `getPatternTextures(id)` returns
  `{ color: THREE.CanvasTexture, rough, roughMean } | null` (null for `pattern.kind === 'none'`).
  `texture.image` is a 512² `HTMLCanvasElement` → `canvas.toDataURL('image/png')` after
  downscaling to 48² via a scratch canvas. Cache the data URLs in a module `Map<string, string>`.
  In tests (`node` environment) `makeCanvas` returns null, so the swatch falls back to `swatchColor`.
- Translation: `tr(def.name)` for names, `materialCategoryName(language, category)` (`src/i18n/catalog.ts:94`).
- CSS: `src/ui/styles.css:338-359` (`.mat-pick`, `.swatch-btn`, `.swatch`, `.swatch-pop`,
  `.swatch-cat`, `.swatch-grid`, `.swatch.on`).
- UI test pattern: `tests/ui/modalFocus.test.tsx:1-26` (`@vitest-environment jsdom` pragma,
  `createRoot`, `act`, `IS_REACT_ACT_ENVIRONMENT`).
- Settings persistence pattern: `src/settings/index.ts` (zustand store persisted under
  `nestwright:settings`). The recent list is UI state, not a project field: a plain module with
  `localStorage` under the key `nestwright:recent-materials` (JSON array of ids, newest first, max 12).

## Steps
1. `tests/ui/swatchPicker.test.tsx` (new, jsdom). Render `<SwatchPicker value={{id:'oak-planks'}} onChange={spy} />`
   inside `act`. Assert: there is one `button.swatch` per material in `MATERIALS` (99) plus none for
   categories; the oak swatch has class `on`; typing `vel` into `input[aria-label="Search materials"]`
   leaves only materials whose English name contains "vel" (case-insensitive: `fabric-velvet-green`,
   `velvet-rust`) and hides empty category headings; clicking the `velvet-rust` swatch calls
   `onChange({ id: 'velvet-rust' })` (the `value`'s `tint`/`scale` preserved when present) and
   `rememberRecent` wrote `["velvet-rust"]` to `localStorage['nestwright:recent-materials']`;
   re-rendering shows a "Recent" group first with that swatch; `recentMaterials()` caps at 12 and
   de-duplicates (push the same id twice → one entry at the front).
2. `src/ui/recentMaterials.ts` (new):
   ```ts
   export const RECENT_KEY = 'nestwright:recent-materials'
   export function recentMaterials(): string[]          // [] when storage missing or invalid JSON
   export function rememberRecent(id: string): void     // unshift, dedupe, slice(0, 12), save; swallow storage errors
   export function subscribeRecent(listener: () => void): () => void   // for useSyncExternalStore
   ```
3. `src/ui/swatchThumb.ts` (new): `export function swatchThumb(id: string): string | null` —
   `getPatternTextures(id)?.color.image` drawn onto a 48×48 canvas (`document.createElement('canvas')`,
   `drawImage(image, 0, 0, 48, 48)`), `toDataURL`, cached; returns null when `document` is undefined,
   the image is missing or the pattern is `none`.
4. `src/ui/SwatchPicker.tsx` (new):
   ```tsx
   export function SwatchPicker({ value, onChange, onClose }: { value: MaterialRef; onChange: (next: MaterialRef) => void; onClose?: () => void })
   ```
   Layout: `<div className="swatch-pop swatch-pop-lg">` → search `<input className="search" aria-label={tr('Search materials')} placeholder={tr('Search materials')} />`,
   then groups: "Recent" (only when non-empty and the query is empty; heading `tr('Recent')`), then
   `MATERIAL_CATEGORIES` in order. Each swatch: `<button type="button" className={id===value.id ? 'swatch swatch-lg on' : 'swatch swatch-lg'} title={tr(def.name)} aria-label={tr(def.name)} style={{ background: thumb ? \`url(${thumb})\` : swatchColor(def.id), backgroundSize: 'cover' }} />`
   and a 10 px caption `<span className="swatch-name">{tr(def.name)}</span>` under it. Filter:
   `tr(def.name).toLowerCase().includes(q) || def.name.toLowerCase().includes(q) || def.id.includes(q)`.
   On click: `rememberRecent(id); onChange({ ...value, id }); onClose?.()`.
5. `src/ui/MaterialPicker.tsx` — replace lines 108-131 with `{open && <SwatchPicker value={value} onChange={onChange} onClose={() => setOpen(false)} />}`.
   Make the trigger button (line 71-74) show the pattern thumb too (`swatchThumb(value.id)` background when available).
6. `src/ui/styles.css` — after line 357 add:
   `.swatch-pop-lg { width: 100%; max-height: 360px; overflow-y: auto; padding: 8px; }`,
   `.swatch-pop-lg .search { width: 100%; margin-bottom: 6px; }`,
   `.swatch-pop-lg .swatch-grid { gap: 6px; }`,
   `.swatch-cell { display: flex; flex-direction: column; align-items: center; width: 56px; }`,
   `.swatch-grid .swatch-lg { width: 48px; height: 48px; border-radius: 8px; }`,
   `.swatch-name { font-size: 10px; line-height: 12px; text-align: center; color: var(--muted); max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`.
7. `src/i18n/en.ts`: `'Search materials': 'Search materials'`, `'Recent': 'Recent'`; `pt.ts`:
   `'Procurar materiais'`, `'Recentes'`.

## Tests to add
- `tests/ui/swatchPicker.test.tsx` — step 1 (6 assertions).
- `tests/ui/recentMaterials.test.ts` (node): `rememberRecent` with a stubbed `globalThis.localStorage`
  (`{ getItem, setItem }` over a Map) keeps order, dedupes, caps at 12; with no storage, `recentMaterials()` is `[]`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n tests/materials` green.
- `npx vitest run tests/ui/swatchPicker.test.tsx` prints `passed`.
- In the app: select a sofa → Fabric slot → the popup shows 48 px pattern swatches with names;
  type "oak" → only oaks; pick one → it appears under "Recent" the next time the popup opens.

## Out of scope / forbidden
- No colour/tint changes (f02), no favourites (f03). Keep `MaterialPicker`'s props unchanged.
- Do not edit existing tests or user-facing strings ('Tint', 'Brightness', 'Scale' stay).
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
