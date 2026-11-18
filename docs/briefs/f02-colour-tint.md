# f02 — Colour tint: hue and lightness for paint, fabric and leather

**Epic:** features **Release:** v0.20.0 **Owner model:** grok-4.7-medium
**Depends on:** f01
**Time box:** ≤ 20 min of agent work

## Goal
Paints, fabrics and leathers can be recoloured with a hue slider and a lightness slider; the
result is always within what the renderer can show faithfully (the same clamps `albedoTint`
applies to scans), and a "Reset colour" button returns to the library colour. Stone, wood,
tile, metal, glass and the other categories no longer offer a tint at all, because tinting a
scan of oak into blue looked wrong.

## Context the implementer needs
- `MaterialRef.tint?: string` already exists (`src/model/types.ts:18-26`, hex `#rrggbb`) and
  the cache key includes it (`src/materials/materialCache.ts:30-35`). Procedural materials
  multiply `mat.color` by the tint (lines 190-195); scans multiply the `albedoTint` colour by it
  (`applyPbrMaps`, line 119-122). Nothing in rendering needs to change.
- Clamps to mirror: `src/materials/pbrTextures.ts` — `GAIN_MIN/GAIN_MAX` (luminance ×⅓…×3) and
  `HUE_MIN/HUE_MAX` (per-channel share 0.7…1.4); read their definitions above line 115 and copy the
  numbers into the pure module (do not import `pbrTextures.ts` into `src/model/`: it pulls three).
- Current UI: `src/ui/MaterialPicker.tsx:75-95` — a `<input type="color">` ("Tint") and a
  "Brightness" range for every material. Helpers `channel`, `toHex`, `lightnessOf`, `withLightness`,
  `cssHex` (lines 9-59) move to the pure module.
- Material categories: `src/materials/library.ts` `MaterialDef.category` — tintable set is
  `Paint` and `Fabric` (leathers `leather-brown/black/tan/cream` are in Fabric). `getMaterialDef(id)`.
- Strings: `'Tint'`, `'Brightness'`, `'Tint colour'`, `'Tint brightness'` exist in en/pt; keep using them.

## Steps
1. `tests/model/tint.test.ts` (new):
   - `hexToHsl('#ff0000')` → `{ h: 0, s: 1, l: 0.5 }`; `hslToHex({ h: 120, s: 1, l: 0.5 })` → `'#00ff00'`;
     round trip of `'#c8643b'` within 1/255 per channel.
   - `isTintable('paint-sage') === true`, `isTintable('leather-tan') === true`, `isTintable('oak-planks') === false`,
     `isTintable('glass') === false`, `isTintable('unknown') === false`.
   - `clampTint('#808080', '#ffffff')` returns a hex whose luminance ≤ 3 × luminance of `#808080`
     (i.e. gain clamped); `clampTint('#808080', '#000000')` has luminance ≥ ⅓ × base;
     `clampTint('#808080', '#ff0000')` has the red share clamped to ≤ 1.4 × and green/blue ≥ 0.7 × the
     base shares (compute shares as channel / luminance with `0.2126, 0.7152, 0.0722` weights);
     `clampTint('#808080', '#8a8a8a') === '#8a8a8a'` (inside the box: unchanged).
   - `tintFor('paint-sage', 200, 0.5)` returns `{ id: 'paint-sage', tint }` with `tint` = `clampTint(def.color, hslToHex({h:200, s: sOf(def.color), l: 0.5}))`
     where `sOf` is the saturation of the library colour raised to at least 0.25.
2. `src/model/tint.ts` (new, pure):
   ```ts
   export interface Hsl { h: number; s: number; l: number }    // h 0–360, s,l 0–1
   export function hexToHsl(hex: string): Hsl
   export function hslToHex(hsl: Hsl): string                   // '#rrggbb' lowercase
   export const TINT_GAIN = [1 / 3, 3] as const
   export const TINT_HUE_SHARE = [0.7, 1.4] as const
   export function clampTint(baseHex: string, tintHex: string): string
   export const TINTABLE_CATEGORIES = new Set(['Paint', 'Fabric'])
   export function isTintable(materialId: string): boolean     // getMaterialDef(id) category in the set
   export function tintFor(materialId: string, hue: number, lightness: number): MaterialRef
   ```
   `clampTint`: convert both to linear RGB (sRGB decode), `gain = lum(tint·base)/lum(base)`
   clamped to `TINT_GAIN`, per-channel share ratio clamped to `TINT_HUE_SHARE`, then the
   resulting target colour divided by base gives the tint; encode back to sRGB hex. The tint is
   what `mat.color` is multiplied by, so the test's "luminance" statements are about `base × tint`.
   Importing `getMaterialDef` from `src/materials/library.ts` is allowed (no three in that file).
3. `src/ui/MaterialPicker.tsx`:
   - Delete the local colour helpers (lines 9-59); import from `../model/tint`.
   - Compute `const tintable = isTintable(value.id)`. When `tintable`, render under the label
     `<T k="Tint" />`: a hue range `min 0 max 360 step 1` (`aria-label={tr('Hue')}`) and a lightness
     range `min 10 max 90 step 1` (`aria-label={tr('Tint brightness')}`, label `<T k="Brightness" />`),
     both reading from `hexToHsl(value.tint ?? def.color)` and writing `onChange(tintFor(value.id, h, l/100))`;
     plus `<button type="button" onClick={() => { const { tint, ...rest } = value; onChange(rest) }}>{tr('Reset colour')}</button>`
     shown only when `value.tint` is set. When not tintable, render none of these; if a non-tintable
     `value` still carries a `tint` (older saves), show only the reset button.
   - Remove the `<input type="color">`. Keep the Scale slider for every material.
   - Picking a different material in the swatch grid (f01's `onChange({ ...value, id })`) keeps the
     tint only when the new id is tintable: wrap `onChange` passed to `SwatchPicker` to drop `tint` otherwise.
4. `src/i18n/en.ts`: `'Hue': 'Hue'`, `'Reset colour': 'Reset colour'`; `pt.ts`: `'Tom'`, `'Repor cor'`.

## Tests to add
- `tests/model/tint.test.ts` — step 1.
- `tests/ui/materialPickerTint.test.tsx` (jsdom, pattern of `tests/ui/modalFocus.test.tsx`): render
  `<MaterialPicker value={{id:'oak-planks'}} onChange={spy} />` → no `input[type=range][aria-label="Hue"]`;
  with `{id:'paint-sage'}` → the hue and brightness ranges exist and changing hue to 200 calls `onChange`
  with `{ id: 'paint-sage', tint: <string matching /^#[0-9a-f]{6}$/> }`; with `{id:'paint-sage', tint:'#aabbcc'}`
  clicking "Reset colour" calls `onChange({ id: 'paint-sage' })`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/model tests/ui tests/i18n tests/materials` green.
- `grep -n 'type="color"' src/ui/MaterialPicker.tsx` prints nothing.
- In the app: a sofa's Fabric slot shows Hue/Brightness; a wall in `oak-planks` shows no tint
  controls; dragging hue on `paint-sage` recolours the 3D paint live; Reset colour restores it.

## Out of scope / forbidden
- Do not change `materialCache.ts`, `pbrTextures.ts` or the cache key.
- Do not edit existing tests or user-facing strings; 'Hue' and 'Reset colour' are new.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
