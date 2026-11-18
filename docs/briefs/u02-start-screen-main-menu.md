# u02 — Start screen becomes a main menu

**Epic:** UI shell **Release:** v0.16.0 **Owner model:** grok-4.7-medium
**Depends on:** u01
**Time box:** ≤ 20 min of agent work

## Goal
Launching the game lands on a real main menu over the orbiting house: Continue, New house
(Blank / From template / From brief), Open…, Settings, Credits and, on the desktop app, Quit.
Recent projects keep their thumbnails. "New house → Blank" opens an empty plan without a
confirm prompt; "Credits" opens the Help dialog on its Credits tab. The button named
"Continue" keeps that exact accessible name because every e2e spec clicks it.

## Context the implementer needs
- `src/ui/start/StartScreen.tsx`: the glass panel (L121–194) renders the wordmark, Continue
  (`className="start-primary"`, disabled when `!canContinueProject()`), "New project" (opens the
  template gallery), "House Briefs", "Open…", the recent list, "Join partner", Settings, Quit.
  The panel is `role="dialog" aria-label={tr('Nestwright')}` — `tests/e2e/smoke.spec.ts` L26
  looks that dialog up by name; keep it.
- `src/ui/session.ts`: module store with `showGallery`, `showBriefs`, `showStart`, `openHome`,
  `enterEditor`, `beginProject(project, filePath)`, `canContinueProject`, `useScreen`.
- `src/ui/actions.ts` L111 `newProject()` asks "Start a new empty project?" via `confirmIfNeeded`
  and ends with a status message. The menu's Blank must not ask: nothing is open yet.
  `createProject(name, 'house')` is in `src/model/defaults.ts`; `translate(language, 'Untitled')`
  is the default name (see `newProject`).
- Credits tab: `src/achievements/helpPage.ts` `setHelpPage('credits')`; `src/ui/shortcuts.ts`
  `setHelpOpen(true)`. `HelpDialog` is mounted in `App.tsx` for every screen.
- `getPlatform().isElectron` and `getPlatform().quit` (`src/platform/types.ts` L79–80).
- jsdom test pattern: `tests/ui/topBar.test.tsx` (createRoot + `act`, `IS_REACT_ACT_ENVIRONMENT`).
- Strings: `Continue`, `Open…`, `Settings`, `Credits`, `Quit`, `Recent`, `Join partner`, `Back`
  exist in `src/i18n/en.ts`. New keys go in `en.ts` and `pt.ts`.

## Steps
1. `tests/ui/startMenu.test.tsx` (new, jsdom). Import `MainMenu` from `src/ui/start/MainMenu`
   and helpers from `src/ui/session`. Cases:
   - renders buttons with accessible names `Continue`, `New house`, `Open…`, `Settings`, `Credits`
     and no `Quit` (not Electron); `Continue` is `disabled` when `canContinueProject()` is false.
   - clicking `New house` shows `Blank`, `From template`, `From brief`, `Back`; `Back` returns.
   - clicking `Blank`: `useScreen`-backed `currentScreen()` is `'editor'`, the store project has
     `levels[0].walls.length === 0` and `name === 'Untitled'`, and no confirm dialog was mounted
     (`document.querySelector('[role="dialog"]')` is null after the click).
   - clicking `Credits`: `isHelpOpen()` true and `helpPage() === 'credits'`.
2. `src/ui/session.ts`: add `export function currentScreen(): Screen` (returns `screen`) and
   `export function beginBlankProject(): void` — builds
   `createProject(translate(useSettings.getState().language, 'Untitled'), 'house')` and calls
   `beginProject(project)`. Add `export function openCredits(): void` that calls
   `setHelpPage('credits')` then `setHelpOpen(true)` (import from `../achievements/helpPage` and
   `./shortcuts`).
3. `src/ui/start/MainMenu.tsx` (new): the panel contents only (no 3D stage). Local
   `const [page, setPage] = useState<'main' | 'new'>('main')`. Main page, in order:
   `Continue` (`start-primary`, `disabled={!canContinueProject()}`, `enterEditor()`), `New house`
   (`aria-expanded={page === 'new'}`, `setPage('new')`), `Open…` (existing `openProject().then(ok => ok && enterEditor())`),
   recent block (moved verbatim from StartScreen, including `openRecent` and the lazy thumb effect
   for `recent:${id}`), `Join partner` (when `coopJoinAvailable()`), `Settings`, `Credits`
   (`openCredits()`), `Quit` (Electron only). New page: heading `New house`, buttons `Blank`
   (`beginBlankProject()`), `From template` (`showGallery()`), `From brief` (`showBriefs()`), `Back`
   (`setPage('main')`). Root stays `<div className="glass start-panel" role="dialog" aria-label={tr('Nestwright')}>`
   with the `wordmark` div first.
4. `src/ui/start/StartScreen.tsx`: delete the inline panel and render `<MainMenu />` in its place;
   keep the gallery and briefs branches and the template-thumb effect. Remove imports that became
   unused (`canContinueProject`, `enterEditor`, `openProject`, `setSettingsOpen`, `coop`, `recent*`
   as applicable — typecheck tells you).
5. `src/ui/styles.css`: `.start-panel .menu-head { display: flex; justify-content: space-between; align-items: center; }`
   and give `.start-panel button` `border-radius: var(--r-md)`, `padding: var(--s3) var(--s4)`,
   `font-size: var(--fs-md)`; `.start-primary` uses `var(--accent)` background at 18 % mix and
   `var(--accent)` border (tokens from u01).
6. Strings in `en.ts` + `pt.ts`: `New house` → `Casa nova`; `Blank` → `Em branco`;
   `From template` → `A partir de um modelo`; `From brief` → `A partir de um desafio`.

## Tests to add
- `tests/ui/startMenu.test.tsx` — the four cases in step 1.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/ui tests/i18n` green.
- `grep -n "New project\|House Briefs" src/ui/start/StartScreen.tsx src/ui/start/MainMenu.tsx`
  prints nothing (the keys stay in `en.ts`: `actions.ts` and `BriefsGallery.tsx` still use them).
- `npm run dev`: the menu shows the six items; New house → Blank opens an empty editor with no
  confirm; Credits opens Help on the Credits tab; the smoke flow (`Continue`) still works.

## Out of scope / forbidden
- Do not edit existing tests or user-facing strings; do not rename `Continue`, `Open…`, `Settings`.
- Do not touch `BriefsGallery.tsx`, the template gallery grid, or `actions.ts`.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
