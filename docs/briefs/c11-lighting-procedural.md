# c11 — Lighting: 6 procedural lamps

**Epic:** catalog **Release:** v0.19.0 **Owner model:** grok-4.7-medium
**Depends on:** c02
**Time box:** ≤ 20 min of agent work

## Goal
Lighting gains a desk lamp, a tripod floor lamp, a picture light, a linear pendant with a
length parameter, an under-cabinet light with a length parameter and a ceiling fan with light,
all real lamps with lumens and kelvin that the Light inspector can edit. Existing
`arc-floor-lamp`, `wall-sconce`, `spotlight-track`, `led-strip`, `floor-lamp`, `pendant-lamp`,
`table-lamp`, `ceiling-light`, `chandelier` stay untouched.

## Context the implementer needs
- Lamp entries: `src/catalog/entries/lighting.ts:8-80` — the `light` spec shape
  `{ color, intensity, lumens, kelvin, distance, offsetY, spot?, angle? }`, `markShade(mesh)`
  for emissive parts, `mount: 'ceiling' | 'wall'`, `mountHeight`. `tuneLamp`
  (`src/builders/items.ts:79-129`) adds exactly one Point or Spot light per item at `offsetY`.
- Number param + `paramNum`: `src/catalog/entries/dining.ts:36,43`; `params.tsx:24-29` `commit`.
- Helpers: `src/catalog/parts.ts` — `roundedBox`, `cylinder`, `ellipsoid`, `markShade`, `matOf`, `group`.
- Materials: `metal-black`, `oak-planks`, `fabric-linen`, `metal-brass`, `plaster-white`,
  `aluminium-brushed`, `steel-brushed`, `walnut-planks`.
- i18n: `catalog.<id>` keys; param label `'Length'` exists (wall inspector) — confirm with
  `grep -n "^  Length:\|'Length'" src/i18n/en.ts`; slot keys `'Blades'`/`'Pás'`, `'Shade'`, `'Legs'`, `'Metal'` (the last three exist).
- Bounds rule: `tests/catalog/catalog.test.ts` builds at `defaultSize` and at `w×1.7, d×0.62, h×1.35`.

## Steps
1. `tests/catalog/lighting2.test.ts` (new): import `'../../src/catalog'`; assert each of the 6
   new ids has `category === 'lighting'`, `light.lumens > 0`, `light.kelvin` in `[2200, 4500]`,
   `price > 0`; `picture-light.mount === 'wall'`, `under-cabinet-light.mount === 'wall'`,
   `linear-pendant.mount === 'ceiling'`, `ceiling-fan-light.mount === 'ceiling'`; building
   `desk-lamp` at `defaultSize` yields at least one mesh with `userData.shade === true`; the two
   `length` params have `kind === 'number'`.
2. `src/catalog/entries/lighting.ts` — append, `category: 'lighting'`, tags `['light']`:
   - `desk-lamp` "Desk lamp" 0.18×0.35×0.45 / 65 / `metal: metal-black, shade: metal-black` /
     `light: { color: '#fff1dc', intensity: 10, lumens: 400, kelvin: 3000, distance: 3, offsetY: 0.4, spot: true, angle: 0.9 }` —
     base `cylinder(metal, 0.5, 0.02, 0, 0.01, d*0.3)` scaled `(w, 1, w)`; stem `cylinder(metal, 0.008, h*0.85, 0, h*0.44, d*0.3)`; arm `cylinder(metal, 0.008, d*0.6, 0, h*0.86, 0, 'z')`; head `cylinder(shade, w/2, h*0.14, 0, h*0.93, -d*0.3)` + `markShade`.
   - `tripod-floor-lamp` "Tripod floor lamp" 0.55×0.55×1.55 / 190 / `legs: oak-planks, shade: fabric-linen` /
     `light: { color: '#ffe6c2', intensity: 16, lumens: 800, kelvin: 2700, distance: 6, offsetY: 1.3 }` —
     three legs `cylinder(legs, 0.015, h*0.75, r·cos(a_i), h*0.375, r·sin(a_i))` with `r = min(w,d)*0.4`; shade `cylinder(shade, 0.5, h*0.22, 0, h*0.89, 0)` scaled `(w, 1, d)` + `markShade`.
   - `picture-light` "Picture light" 0.4×0.12×0.08 / 85 / `metal: metal-brass` / `mount: 'wall', mountHeight: 1.9` /
     `light: { color: '#fff4e0', intensity: 8, lumens: 300, kelvin: 2700, distance: 2.5, offsetY: 0.0, spot: true, angle: 1.1 }` —
     arm `cylinder(metal, 0.008, d-0.03, 0, h*0.5, 0, 'z')`; tube `cylinder(metal, h*0.25, w, 0, h*0.6, d/2-h*0.25, 'x')` + `markShade`.
   - `linear-pendant` "Linear pendant" 1.2×0.08×0.9 / 260 / `metal: metal-black, shade: plaster-white` / `mount: 'ceiling'` /
     params `[{ key: 'length', label: 'Length', kind: 'number', min: 0.6, max: 2.4, step: 0.1, default: 1.2 }]` — the param only sets `size.w` through params.tsx (step 6);
     `light: { color: '#fff6ea', intensity: 30, lumens: 1800, kelvin: 3000, distance: 6, offsetY: 0.05 }` —
     canopy `roundedBox(metal, w*0.2, 0.02, d, 0, h-0.01, 0)`; two cords `cylinder(metal, 0.003, h-0.08, ±w*0.35, (h-0.08)/2+0.06, 0)`; bar `roundedBox(shade, w, 0.06, d, 0, 0.03, 0, 0.01)` + `markShade`.
   - `under-cabinet-light` "Under-cabinet light" 0.6×0.04×0.03 / 40 / `metal: aluminium-brushed, shade: plaster-white` / `mount: 'wall', mountHeight: 1.45` /
     params `[length]` as above (min 0.3, max 1.8, default 0.6) /
     `light: { color: '#fff8ee', intensity: 12, lumens: 500, kelvin: 4000, distance: 2.5, offsetY: 0.0 }` —
     profile `roundedBox(metal, w, h, d, 0, h/2, 0, 0.004)`; diffuser `roundedBox(shade, w-0.01, 0.006, d-0.01, 0, 0.003, 0, 0)` + `markShade`.
   - `ceiling-fan-light` "Ceiling fan with light" 1.2×1.2×0.45 / 320 / `metal: steel-brushed, blades: walnut-planks, shade: plaster-white` / `mount: 'ceiling'` /
     `light: { color: '#fff4e0', intensity: 32, lumens: 1200, kelvin: 3000, distance: 8, offsetY: 0.08 }` —
     canopy and rod `cylinder(metal, 0.02, h*0.5, 0, h*0.75, 0)`; motor `cylinder(metal, 0.09, h*0.2, 0, h*0.4, 0)`; 4 blades `roundedBox(blades, w*0.5-0.1, 0.012, d*0.1, …)` rotated `i·π/2` about y, placed at `x = ±(w*0.25+0.05)` / `z = ±(d*0.25+0.05)` so they end at `±w/2`; shade `ellipsoid(shade, 0.3, h*0.25, 0.3, 0, h*0.15, 0)` + `markShade`.
3. `src/ui/inspector/sections/params.tsx:24-29` — after `found.params[key] = value` add
   `if (key === 'length' && typeof value === 'number' && (found.catalogId === 'linear-pendant' || found.catalogId === 'under-cabinet-light')) found.size.w = value`.
4. `src/i18n/en.ts`, `pt.ts` — 6 `catalog.<id>` keys (pt: Candeeiro de secretária, Candeeiro tripé,
   Luz de quadro, Suspensão linear, Luz sob armário, Ventilador de teto com luz); `'Blades'`/`'Pás'`.

## Tests to add
- `tests/catalog/lighting2.test.ts` — step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/catalog tests/i18n tests/builders tests/model/lampExposure.test.ts` green.
- `grep -c "id: '" src/catalog/entries/lighting.ts` prints `13`.
- In the app: place a linear pendant; the Light section shows 1800 lm / 3000 K; set Length 2.0 → the bar is 2 m wide.

## Out of scope / forbidden
- Do not change existing lighting entries, tests or strings. Keep one light per item.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
