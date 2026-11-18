# b06 — Debt cleanup

**Epic:** Bugs **Release:** v0.18.0 **Owner model:** grok-4.7-medium
**Depends on:** b01 (creates `docs/BUGS.md`; create it with the same header if it is missing)
**Time box:** ≤ 20 min of agent work

## Goal
"New" no longer asks "Start a new empty project?" when nothing has changed since the last save.
Rain is audible: a soft filtered-noise bed fades in when the project weather is `rain`. Two
uniforms stop being written every frame. The five `PHASE1-PORT` notes leave the code; the one
that is still open (sky colours fitted for ACES) becomes a row in `docs/BUGS.md`.

## Context the implementer needs
- `src/ui/actions.ts:111` `newProject()` calls `confirmIfNeeded(translate(language, 'Start a new empty project?'), …)`.
  `src/io/dirty.ts:22` `isDirty()`, `markSaved()` (l.27), `subscribeDirty` (l.31).
- `src/view3d/atmosphere/layer.ts:315–316`: `aoStrength.value = …`, `aoIndirectCap.value = …`
  every frame from `autoExposureState().indoor`.
- `src/audio/ambience.ts`: `AmbienceInput.rain?: boolean` (l.15, "a rain bed can read this
  later"), `MixLevels` (l.18), `ambienceMix` (l.106), `crossfadeMix` (l.133), `fillPinkNoise`
  (l.223), `ensure(ctx, bus)` (l.307) builds the graph, `applyMix` (l.363) ramps gains with
  `ramp(param, value, now, seconds)` (l.274), `stopGraph` (l.280). `src/audio/ambienceScene.ts:31`
  already passes `rain: env.weather === 'rain'`. Existing tests: `tests/audio/*.test.ts`
  (check the directory name with `ls tests/audio`).
- `PHASE1-PORT` markers: `src/view3d/atmosphere/gradeSky.ts:20`, `atmosphere/stars.ts:10`,
  `atmosphere/precip.ts:82`, `terrain/textures.ts:307`, `layers/city.ts:158`.
- `docs/BUGS.md` header from b01: `| id | repro steps | expected | actual | spec |`.

## Steps
1. Tests first (see below).
2. `src/ui/actions.ts`: export `needsNewProjectConfirm(): boolean { return isDirty() }` and in
   `newProject()` call `confirmIfNeeded` only when it returns true; otherwise run the body
   directly. Also clear the project without a prompt right after `markSaved()` paths (already
   the case: `markSaved()` is called in `newProject`).
3. `src/view3d/atmosphere/layer.ts:315–316`: keep `let lastInside = NaN`; compute `inside`,
   and only when `Math.abs(inside - lastInside) > 1e-3` write both uniforms and update
   `lastInside`.
4. `src/audio/ambience.ts`:
   - `MixLevels` gains `rain: number`; `const RAIN_PEAK = 0.05`; `ambienceMix` sets
     `rain: input.rain ? RAIN_PEAK * (input.view === '2d' ? 0 : 1) * (input.indoor ? 0.45 : 1) : 0`
     (rain through a window is quieter, the plan is silent); `crossfadeMix` and `sameMix`
     include `rain`.
   - Graph: in `ensure()`, add a second pink-noise `AudioBufferSourceNode` (reuse `fillPinkNoise`,
     4 s buffer, `loop = true`) → `BiquadFilterNode` bandpass `frequency 1800 Hz, Q 0.7` →
     `GainNode rainGain` (initial 0) → the existing master gain. A slow LFO is not needed; instead
     every `POLL_MS` tick nudge the bandpass frequency with `ramp(filter.frequency, 1500 + rng() * 800, now, 0.5)`
     so the bed does not sound static. `applyMix` ramps `rainGain.gain` to `target.rain` over
     `target.fadeSeconds`. `stopGraph` disconnects the new nodes.
5. `PHASE1-PORT` notes: in `stars.ts`, `precip.ts`, `textures.ts`, `city.ts` delete the
   `PHASE1-PORT:` prefix and keep the rest of the sentence as a normal comment (the ports are in
   use and have shipped since v0.9). In `gradeSky.ts` do the same, and add this row to
   `docs/BUGS.md`:
   `| R-SKY-ACES | Open the family template at 18:00, compare the sky to a photo reference | sky colours tuned for AgX | colours were fitted for ACES (gradeSky.ts) and look flat under AgX | none (visual) |`.
   Make sure `grep -rn PHASE1-PORT src` returns nothing afterwards.
6. `docs/BUGS.md`: if missing, create it with the b01 header. Add a second table at the end,
   `## Fixed`, same columns plus `| fixed in |`, and move nothing yet (b02–b05 move their rows).

## Tests to add
- `tests/ui/newProjectConfirm.test.ts`: mock `../../src/io/dirty` (`vi.mock`) so `isDirty`
  returns false → `needsNewProjectConfirm()` is false; true → true. Import only the pure helper
  (if `actions.ts` pulls in DOM-only modules at import time, move `needsNewProjectConfirm` to
  `src/io/dirty.ts` as `needsConfirmBeforeDiscard()` and test it there; say so in the summary).
- `tests/audio/rainBed.test.ts` (or the existing audio test directory):
  - `ambienceMix({ daylight: 1, indoor: false, view: '3d', rain: true }).rain` equals `0.05`;
  - `indoor: true` → `0.0225` (±1e-6); `view: '2d'` → `0`; `rain` omitted → `0`;
  - `crossfadeMix(a, b, 0.75, 1.5).rain` is the midpoint of `a.rain` and `b.rain`.
- `tests/view3d/aoDirty.test.ts`: extract the dirty-check into a tiny pure helper
  `shouldWriteAo(prev: number, next: number): boolean` in `src/view3d/atmosphere/aoDirty.ts`
  (used by `layer.ts`) and assert `shouldWriteAo(NaN, 0.3)` true, `(0.3, 0.3004)` false,
  `(0.3, 0.31)` true.

## Acceptance
- `npm run typecheck && npm run lint && npm test` green (the full suite: audio tests exist already).
- `grep -rn PHASE1-PORT src` prints nothing.
- `docs/BUGS.md` has the `R-SKY-ACES` row and a `## Fixed` section.
- Manual (describe in the summary, not required to run): with weather `rain` in 3D the bed
  fades in over 1.5 s; switching to the 2D view silences it.

## Out of scope / forbidden
- Do not touch `.toast-stack` CSS (`src/ui/styles.css:723` vs `src/ui/together/together.css:37`):
  the UI epic restyles both files.
- Do not retune the sky colours.
- Do not edit existing tests or user-facing strings.
- Do not start a dev server. Do not commit, push or merge. No new dependencies.
