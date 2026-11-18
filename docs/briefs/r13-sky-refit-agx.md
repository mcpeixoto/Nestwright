# r13 — Sky refit for AgX: haze band, sun glow, dusk cloud under-lighting

**Epic:** realism **Release:** v0.23.0 **Owner model:** claude
**Depends on:** none
**Time box:** ≤ 20 min of agent work

## Goal
The sky stops looking like a two-stop gradient with a hard disc. The dome gains a horizon
haze band, a soft sun glow with a tight core and a wide skirt, and clouds at dusk take warm
under-lighting from the low sun. The noon and sunset display targets are refit for AgX
(the `PHASE1-PORT` note in `gradeSky.ts:20` goes away). `litColour.test.ts`,
`skyParams.test.ts`, `toneMap.test.ts` and `clouds.test.ts` must keep passing unchanged.

## Context the implementer needs
- `src/view3d/atmosphere/gradeSky.ts`: `SkyGrade { zenith, horizon, sunDisc, ground }`,
  `createGradedSky(grade)` — gradient `smoothstep(0, 0.62, direction.y)`, ground below,
  sun disc `smoothstep(0.99955, 0.99992, cosTheta)`. Uniforms are `uniform(Color)`.
- `src/view3d/atmosphere/layer.ts:48–65` `paintSky(dome, unit, showSun, grade, light, params)`
  writes the grade from `SkyParams` (`zenithScene`, `horizonScene`, `groundLight`,
  `SUN_DISC`); `applySky` (l.181) is keyed by alt/weather/cloudiness/exposure/tone.
- `src/view3d/atmosphere/skyParams.ts`: display targets `NOON_ZENITH_SRGB [95,140,200]`,
  `NOON_HORIZON_SRGB [190,205,220]`, `SUNSET_ZENITH_SRGB [86,98,156]`,
  `SUNSET_HORIZON_SRGB [236,132,72]`; `writeSkyParams` (l.263) inverts the active tone curve
  (`invertTone`) so bytes are curve-independent; `*Light` values feed the PMREM;
  `writeCloudColours` (l.239) with `CLOUD_SUNSET_LIT/SHADE`.
- `src/view3d/atmosphere/clouds.ts`: `CloudLookInput { coverage, density, lit, shade, horizon, sun, day }`,
  `CloudDome.set(look)`.
- Tests that pin values: `tests/view3d/skyParams.test.ts` (noon zenith blue-dominant,
  horizon lighter and redder than the zenith; sunset `horizon r > g > b`; night exact
  `[10,16,40]`/`65`); `tests/view3d/litColour.test.ts` (roof/lawn windows at noon depend on
  `zenithLight`/`horizonLight` via `domeIrradiance`; sky share < 0.3);
  `tests/view3d/clouds.test.ts`; `tests/view3d/toneMap.test.ts` ("keeps day, sunset and
  night brightness close to the ACES look").
- Harness: `node scripts/visual/shoot.mjs --serve --views dusk-exterior,garden-wide,front-facade --out visual-out/r13`.

## Steps
1. **Tests first** — `tests/view3d/skyShape.test.ts` against a new pure module (below). Fails.
2. `src/view3d/atmosphere/skyShape.ts` (pure, mirrored by the TSL):
   `export const HAZE = { band: 0.12, amount: 0.55 }`,
   `export const GLOW = { core: 64, skirt: 6, coreGain: 0.9, skirtGain: 0.12 }`;
   `export function hazeWeight(y: number, amount = HAZE.amount)` = `smoothstep(HAZE.band, 0, |y|) * amount`;
   `export function sunGlow(cosTheta: number, altitude: number)` =
   `max(c,0)^core * coreGain + max(c,0)^skirt * skirtGain * lowSun` where
   `lowSun = 1 + 2 * smoothstep(0.35, 0, altitude)` (the skirt grows near the horizon);
   `export function hazeColor(horizon: RGB, zenith: RGB, sunset: number): RGB` =
   `mix(mix(horizon, [235,235,232] in the same space, 0.12), mix(horizon, [250,170,110], 0.3), sunset)`.
3. `gradeSky.ts`: new uniforms `uHaze` (Color), `uHazeAmount`, `uGlow` (Color = sunDisc × 0.35),
   `uAltitude`. Colour = `mix(above, uHaze, hazeWeight(direction.y) via TSL)` +
   `uGlow * sunGlow(cosTheta, uAltitude)` + the disc as today. Add `setAltitude(alt)` and
   `grade.haze: Color` to `SkyGrade`/`GradedSky`. Remove the `PHASE1-PORT` comment; write
   the refit note in its place.
4. `skyParams.ts`: `hazeScene: RGB` and `hazeLight: RGB` on `SkyParams` from
   `hazeColor(horizonDisplay, zenithDisplay, sunset)` through `invertTone` / `srgbToLinear3`;
   `createSkyParams` zeros. Refit display targets: `NOON_ZENITH_SRGB [84, 134, 204]`,
   `NOON_HORIZON_SRGB [196, 208, 220]`, `SUNSET_ZENITH_SRGB [74, 92, 152]`,
   `SUNSET_HORIZON_SRGB [238, 140, 84]`. Night untouched. Run `skyParams.test.ts`,
   `litColour.test.ts`, `toneMap.test.ts` after the change; if the lawn or roof window
   fails, pull the horizon back toward the old value in 4-byte steps until green and report
   the final numbers.
5. `layer.ts paintSky`: write `grade.haze` from `hazeScene` (visible dome) / `hazeLight`
   (env dome, `light = true`); call `skyDome.setAltitude(alt)` in `applySky`.
6. Clouds: `skyParams.ts` adds `CLOUD_SUNSET_UNDER: [242, 150, 108]` and
   `cloudUnderScene: RGB` = `invertTone(mix(shadeDisplay, CLOUD_SUNSET_UNDER, sunset))`;
   `CloudLookInput.under: RGB`; in `clouds.ts` the base colour becomes
   `mix(shade, under, lowSunFacing)` with `lowSunFacing = smoothstep(0.2, -0.05, direction.y) * max(dot(dirXZ, sunXZ), 0) * day`
   (only cloud bases near the horizon on the sun's side warm up). `layer.ts` passes `under`.
7. Harness `dusk-exterior`, `garden-wide`, `front-facade` before/after; paste shots and
   confirm no banding at the haze band (if visible, widen `HAZE.band` to 0.16).

## Tests to add
`tests/view3d/skyShape.test.ts`:
- `hazeWeight(0)` is `HAZE.amount`; `hazeWeight(0.12)` and `hazeWeight(0.5)` are 0;
  monotonic non-increasing on `y ∈ [0, 0.12]`; symmetric in `±y`.
- `sunGlow(1, 0.8)` ≈ `coreGain + skirtGain` (±1e-6); `sunGlow(0.9, 0.8) < sunGlow(0.95, 0.8)`;
  `sunGlow(0.9, 0.02) > sunGlow(0.9, 0.8)` (bigger skirt low); `sunGlow(-0.2, 0.5) === 0`;
  `sunGlow(c, a) ≤ 1.1` for `c ∈ [0, 1]`, `a ∈ [0, 1.5]`.
- `hazeColor` at `sunset 0` is lighter than the horizon (luminance) and at `sunset 1` has `r > b`.
- `skyParams(1.05, 'clear')` returns `hazeScene` with 3 finite positive numbers and
  `cloudUnderScene` finite; at `skyParams(-0.05, 'clear')` `cloudUnderScene[0] > cloudUnderScene[2]`.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/view3d` green, including
  `litColour.test.ts`, `skyParams.test.ts`, `toneMap.test.ts`, `clouds.test.ts` unchanged.
- Harness before/after attached; `dusk-exterior.png` shows a warm band at the horizon, a
  soft glow around the sun side and warm cloud bases; `garden-wide.png` keeps a blue
  zenith; `report.fpsAvg` within 2 % of before (the sky is one quad of extra maths).

## Out of scope / forbidden
- No physical scattering, no sun shafts, no star changes, no fog changes.
- Do not edit existing tests or user-facing strings.
- Do not touch files outside the list in Context without saying so in the summary.
- Do not commit, push or merge. No new dependencies.
