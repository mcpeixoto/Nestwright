# r05 — Window glass v2 (transmission, smudges, inside/outside reflections)

**Epic:** realism **Release:** v0.22.0 **Owner model:** claude
**Depends on:** none (r08 reuses `src/materials/smudge.ts` from this brief)
**Time box:** ≤ 20 min of agent work

## Goal
Windows stop being a 28 %-opaque blue sheet. The pane becomes two 4 mm physical layers:
the room-side layer reflects the room probe, the outside layer reflects the sky;
`transmission 0.92`, `thickness 0.008`, `ior 1.52` (Fresnel from the IOR), a 2 % grey
tint, and a shared smudge roughness map (0.02–0.12) so reflections smear slightly. Night
emissive glow keeps working. Low/Medium tiers fall back to the old alpha glass so the
aerial view stays ≥ 55 fps at High and does not regress below.

## Context the implementer needs
- `src/builders/openings.ts:10–19` `windowGlass()` clones library `glass`
  (`MeshStandardMaterial`, opacity 0.28, `depthWrite false`), sets `userData.windowGlass`.
  Panes: `chamferBox(glass, gw, gh, 0.008, cx, by, gz, 0)` at l.322; sliding door 12 mm at
  l.176; round window `CircleGeometry` disk at l.157. `tag()` at l.23 sets
  `castShadow = !transparent` — a non-transparent transmissive pane would cast shadows.
- `src/view3d/atmosphere/layer.ts:215–232` `paintWindows` sets emissive `#ffb15a` × 2.4 on
  materials with `userData.windowGlass`. `weather.ts:59` skips them.
- `src/view3d/lighting/reflectionProbe.ts:127` `reflectRoom(material)` sets `envNode = roomEnvNode`;
  `hasRoomReflection(material)`. A material with `envNode` null uses `scene.environment` (sky PMREM).
- `src/view3d/render/quality.ts:33–74` `PROFILES`; `qualityProfile(tier)`. Find where the
  profile is applied each frame/tier change with `grep -n "qualityProfile(" src/view3d/SceneController.ts`.
- `src/materials/materialCache.ts` is not involved: the glass materials are module
  singletons owned by `openings.ts`.
- Harness: `node scripts/visual/shoot.mjs --serve --views front-facade,dusk-exterior,living-room,aerial-cutaway --out visual-out/r05`.

## Steps
1. **Tests first** — `tests/builders/windowGlass.test.ts` (see below). Fails.
2. New `src/materials/smudge.ts`: `export function smudgeTexture(): THREE.DataTexture` —
   once, 256² single-channel-in-RGBA (`RGBAFormat`, value in R), 3-octave fbm with a few
   streaky smears (stretch noise 4× along u), `RepeatWrapping`, `NoColorSpace`,
   `generateMipmaps = true`. `export const SMUDGE_TILE_M = 0.6`.
   `export function smudgeRoughnessNode(lo: number, hi: number, uvNode = uv().div(SMUDGE_TILE_M))`
   = `mix(lo, hi, texture(smudgeTexture(), uvNode).r)`.
3. `src/builders/openings.ts`: replace `windowGlass()` with
   ```ts
   export interface WindowGlass { inside: THREE.MeshPhysicalMaterial; outside: THREE.MeshPhysicalMaterial }
   export const GLASS = { transmission: 0.92, thickness: 0.008, ior: 1.52, tint: 0.98, smudge: [0.02, 0.12] } as const
   function glassMaterial(room: boolean): THREE.MeshPhysicalMaterial
   export function windowGlass(): WindowGlass
   ```
   `glassMaterial`: `new MeshPhysicalMaterial({ color: new Color(GLASS.tint, GLASS.tint, GLASS.tint), roughness: 0.06, metalness: 0, transmission: 0.92, thickness: 0.008, ior: 1.52, transparent: false, depthWrite: true, side: FrontSide })`,
   `roughnessNode = smudgeRoughnessNode(0.02, 0.12)`, `userData.windowGlass = true`,
   `userData.glassFace = room ? 'inside' : 'outside'`, `emissive = #000000`;
   `room && reflectRoom(mat)`. The outside material keeps `envNode` null.
4. Geometry: at l.322 replace the single 8 mm box by two 4 mm boxes:
   `chamferBox(glassIn, gw, gh, 0.004, cx, by, gz + toRoom * 0.002, 0)` and
   `chamferBox(glassOut, gw, gh, 0.004, cx, by, gz - toRoom * 0.002, 0)` where
   `glassIn = parts.of(windowGlass().inside)`, `glassOut = parts.of(windowGlass().outside)`.
   Sliding door (l.176): two 6 mm boxes at `z ± side * 0.003`. Round window disk (l.157): `inside`.
5. `tag()`: `mesh.castShadow = material !== undefined && !material.transparent && !material.userData.windowGlass`.
6. Tier fallback: `src/view3d/render/quality.ts` `QualityProfile.glassTransmission: boolean`
   (low false, medium false, high true, ultra true). `openings.ts`:
   `export function setWindowGlassQuality(transmission: boolean)` — on both materials set
   `transmission = on ? 0.92 : 0`, `transparent = !on`, `opacity = on ? 1 : 0.28`,
   `depthWrite = on`, `needsUpdate = true`. Call it where the profile is applied in
   `SceneController.ts` (the `qualityProfile(` site) with `profile.glassTransmission`.
7. `layer.ts paintWindows`: unchanged (both materials have `userData.windowGlass`); confirm
   `emissive` exists on `MeshPhysicalMaterial` (it does).
8. Perf: aerial High before/after; the transmission pass is one extra opaque render per
   frame. If `fpsAvg < 55`, set `high.glassTransmission = false` and keep it on Ultra only; say so.

## Tests to add
`tests/builders/windowGlass.test.ts` (fixture like `tests/builders/facadeWeathering.test.ts:14–23`:
a closed room with a window; `buildOpening(opening, wall, 0, { level })`):
- Glass meshes (`material.userData.windowGlass`) are 2, with distinct materials; both
  `instanceof THREE.MeshPhysicalMaterial`, `transmission === 0.92`, `ior === 1.52`,
  `thickness === 0.008`, `castShadow === false`, `roughnessNode` truthy.
- `hasRoomReflection(inside)` true, `hasRoomReflection(outside)` false;
  `userData.glassFace` is `'inside'` / `'outside'`.
- `setWindowGlassQuality(false)`: both have `transmission 0`, `transparent true`, `opacity 0.28`;
  `setWindowGlassQuality(true)` restores `0.92`, `transparent false`.
- `qualityProfile('low').glassTransmission === false`, `qualityProfile('high').glassTransmission === true`.
- `smudgeTexture()` returns the same instance twice, 256×256, `NoColorSpace`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/builders tests/view3d tests/materials` green.
- Harness `front-facade`, `dusk-exterior`, `living-room`, `aerial-cutaway` before/after
  attached; `aerial-cutaway.json` `report.fpsAvg ≥ 55` at High; no console errors.
- Visual: from outside by day the panes show sky reflection that weakens when looking
  straight in (Fresnel) and the room is visible through them; at dusk (`dusk-exterior`)
  windows glow as before.

## Out of scope / forbidden
- No interior mapping, no dirt on frames, no double-glazing spacer geometry.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
