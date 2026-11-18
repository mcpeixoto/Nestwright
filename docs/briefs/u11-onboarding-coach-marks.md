# u11 — Onboarding v2: anchored coach marks

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u02, u06, u07
**Time box:** ≤ 20 min of agent work

## Goal
The six tour steps become coach marks pinned to the real control they talk about (Build group,
3D button, Doors & windows group, Furniture button, Walk button), with Next, Back and Skip,
progress dots and an arrow. The tour starts only on a blank new house and from Help → "Replay
the tour"; templates and briefs never show it. Step detection from the model keeps working, so
drawing walls still advances the first step by itself.

## Context the implementer needs
- `src/ui/onboarding/logic.ts`: `TourStep { id, titleKey, bodyKey, done }`, `TOUR_STEPS`
  (walls, room, view, door, sofa, walk), `tourProgress`. `tests/ui/onboarding.test.ts` tests
  `tourProgress` only.
- `src/ui/onboarding/Tour.tsx`: module state (`step`, `run`, `baseline`), `isTourOpen`,
  `bindTourEscape` (capture-phase, tested in `tests/ui/tourEscape.test.ts` — keep it), `replayTour`,
  `markDone`, `localStorage['nestwright:tour'] = 'done'`, the `.tour-card` dialog with only Skip.
- Anchors to add: `data-tour="build"` on the Build group trigger and `data-tour="doors"` on the
  Doors & windows trigger (`RailButton` in `src/ui/ToolRail.tsx`, pass through a new optional
  `dataTour` prop), `data-tour="library"` on the Furniture button (u07 added it), `data-tour="view-3d"`
  and `data-tour="view-walk"` on the view-switch buttons in `src/ui/TopBar.tsx`.
- Entry points: `beginBlankProject()` in `src/ui/session.ts` (u02) is the only "blank new house";
  `newProject()` in `src/ui/actions.ts` is the editor's New (also blank — arm it too).
  `HelpDialog.tsx` L74 calls `replayTour()`.
- Strings `Skip`, `Back`, `Step {n} of {total}`, `tour.*.title/body` exist.

## Steps
1. `tests/ui/coachMarks.test.tsx` (new, jsdom): append `<button data-tour="build">` and
   `<button data-tour="view-3d">` to `document.body`; `armTour()` then render `<Tour />`:
   - a `[role="dialog"]` with class `coach-mark` exists, text includes `Draw walls` and
     `Step 1 of 6`; it has `data-anchor="build"`.
   - click `Next` → text `See the room`, `Step 2 of 6`; the second step has no anchor so the mark
     has class `centered`; `Back` → step 1 again; six `.dots i` with the first `.on`.
   - `Skip` → `isTourOpen()` false and `localStorage['nestwright:tour'] === 'done'`.
   - `disarmTour()`; `replayTour()` without arming still opens (replay always arms); after
     `markDone` via Skip, `isTourArmed()` is false.
   - A fresh module state where `isTourArmed()` is false renders nothing even when not dismissed.
2. `src/ui/onboarding/logic.ts`: add optional `anchor?: string` to `TourStep` and set
   `walls: 'build'`, `view: 'view-3d'`, `door: 'doors'`, `sofa: 'library'`, `walk: 'view-walk'`
   (`room` has none). Add `export function stepAfterNext(step: number): number` (= `Math.min(step + 1, TOUR_STEPS.length)`)
   and `stepAfterBack(step)` (= `Math.max(step - 1, 0)`).
3. `src/ui/onboarding/Tour.tsx`:
   - add `let armed = false`; `export function armTour()`, `disarmTour()`, `isTourArmed()`;
     `replayTour()` sets `armed = true`; `markDone()` sets `armed = false`. `isTourOpen()` also
     requires `armed`.
   - export `nextStep()` / `backStep()` using the logic helpers; `nextStep` past the last step
     calls `markDone()`; both reset `baseline = readSnap(seenWalk)` and `publish()`.
   - render a `CoachMark` instead of `.tour-card`.
4. `src/ui/onboarding/CoachMark.tsx` (new): props `{ step, index, total }`. Finds
   `document.querySelector('[data-tour="' + step.anchor + '"]')`; measures with
   `getBoundingClientRect` in a `useLayoutEffect` (re-run on `resize` and on `index`); positions the
   card `position: fixed` to the right of the anchor (`left = rect.right + 12`, `top = rect.top`),
   flipping below when it would leave the window; when no anchor or the element is missing, class
   `centered` (fixed, centred). Markup: `<aside role="dialog" className="coach-mark" data-anchor aria-label={title}>`,
   `<span className="arrow" />`, `<p className="hint">Step n of total</p>`, `<h2>`, `<p>`,
   `<div className="dots">{total × <i className={i === index ? 'on' : ''} />}</div>`, buttons
   `Back` (disabled at 0), `Skip`, `Next` (`start-primary`). Portal to `document.body`.
5. `src/ui/session.ts` `beginBlankProject()`: call `armTour()` after `beginProject`. `src/ui/actions.ts`
   `newProject()`: call `armTour()` after `presentProject`. `src/ui/start/loadTemplate.ts` and
   `src/ui/briefs/startBrief.ts`: no change (they never arm). Add `disarmTour()` in `beginProject`
   so a template opened after a blank house hides the mark.
6. `src/ui/ToolRail.tsx`: `RailButton` gets `dataTour?: string` → `data-tour={dataTour}`; pass
   `'build'` and `'doors'` on the two group triggers. `src/ui/TopBar.tsx`: `data-tour="view-3d"` on
   the 3D button, `data-tour="view-walk"` on Walk.
7. `src/ui/styles.css`: `.coach-mark { position: fixed; z-index: 70; width: 280px; padding: var(--s4); background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--sh-2); }
   .coach-mark .arrow { position: absolute; left: -8px; top: 16px; width: 14px; height: 14px; background: var(--panel); border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); transform: rotate(45deg); }
   .coach-mark.centered { left: 50%; top: 50%; transform: translate(-50%, -50%); } .coach-mark.centered .arrow { display: none; }
   .coach-mark .dots { display: flex; gap: 6px; margin: var(--s2) 0; } .coach-mark .dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); } .coach-mark .dots i.on { background: var(--accent); }
   .coach-mark .row { display: flex; gap: var(--s2); justify-content: flex-end; }`. Delete the `.tour-card` rules.
8. Strings `en.ts` + `pt.ts`: `Next` → `Seguinte`.

## Tests to add
- `tests/ui/coachMarks.test.tsx` — the five cases above.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green (`onboarding.test.ts`
  and `tourEscape.test.ts` untouched and green).
- `npm run dev`: main menu → New house → Blank shows the mark beside Build; drawing walls jumps
  to step 2 by itself; Next/Back work; open a template from the menu: no mark; Help → Replay the
  tour shows it again.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings (tour copy stays).
- Do not change `tourProgress` or the `done` predicates.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
