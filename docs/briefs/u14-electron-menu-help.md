# u14 — Electron menu: localized labels, Help menu, Fullscreen setting

**Epic:** UI shell **Release:** v0.17.0 **Owner model:** grok-4.7-medium
**Depends on:** u03, u05, u11
**Time box:** ≤ 20 min of agent work

## Goal
The desktop menu bar follows the app language everywhere: the Help menu offers Tutorial,
Shortcuts, Credits and Achievements (plus About outside macOS), a Fullscreen checkbox item
mirrors a new `fullscreen` setting (and the setting mirrors F11/⌃⌘F), and the pause menu's Quit
goes through the existing dirty-document quit guard.

## Context the implementer needs
- `electron/main.ts`: `MenuLabels` L71–78 and the defaults L87–94; `isMenu` L275; `installMenu`
  L445–494 (hard-coded `'About Nestwright'`, `'Help'`, `'Achievements'`; `sendMenu(action)` L171;
  `{ role: 'viewMenu' }`); the `nestwright:editor-state` handler L684–695 rebuilds the menu when
  labels change; `nestwright:quit` L702 calls `app.quit()`, and `before-quit` L894 shows the
  Save / Don't save / Cancel prompt when dirty — so Quit already hits the guard. `createWindow` L338.
- `electron/preload.ts`: `setEditorState` L65–71, `onMenu`, `onShowAchievements` L141–145,
  `quit` L108. Types mirrored in `src/platform/global.d.ts` L28–45 and `src/platform/types.ts`.
- `src/ui/documentSession.ts` `syncChrome()` L8–35 builds the `menu` labels with `translate`
  and re-sends on language change; `installDocumentSession` wires `onMenu`.
- Renderer handlers: `replayTour` (`src/ui/onboarding/Tour.tsx`), `setHelpPage` +
  `setHelpOpen`, achievements listener in `src/achievements/boot.ts` (pattern for an IPC listener).
- Settings: `src/settings/index.ts` (`Settings`, `DEFAULT_SETTINGS`, `normalizeSettings`), General
  tab in `src/ui/SettingsDialog.tsx` (u05). jsdom/node test pattern: `tests/electron/smoke.test.ts`
  imports a pure module from `electron/`.
- Strings `Help`, `Shortcuts`, `Credits`, `Achievements`, `View` (check), `File`, `New`, `Open…`,
  `Save`, `Save As…`, `Close Window` exist; new keys go in `en.ts` + `pt.ts`.

## Steps
1. `tests/electron/menuLabels.test.ts` (new): import `DEFAULT_MENU_LABELS`, `isMenuLabels`,
   `helpMenuTemplate`, `viewMenuTemplate` from `electron/menuLabels`:
   - `isMenuLabels(DEFAULT_MENU_LABELS)` true; a copy without `tutorial` → false; a non-object → false.
   - `helpMenuTemplate(labels, send, 'darwin')` returns items with labels `Tutorial`, `Shortcuts`,
     `Credits`, `Achievements` in that order and no About; `'win32'` appends `About Nestwright`;
     clicking the first item calls `send('tutorial')`.
   - `viewMenuTemplate(labels, { fullscreen: true, toggle })` has a `checkbox` item labelled
     `Fullscreen` with `checked: true`; its `click` calls `toggle`.
   - Labels passed in Portuguese come back verbatim (`labels.help === 'Ajuda'` → submenu label `Ajuda`).
2. `tests/settings/fullscreen.test.ts` (new): `normalizeSettings({}).fullscreen === false`;
   `({ fullscreen: true })` → true; `DEFAULT_SETTINGS.fullscreen === false`.
3. `electron/menuLabels.ts` (new, no Electron imports beyond `import type { MenuItemConstructorOptions } from 'electron'`):
   `interface MenuLabels { file, new, open, save, saveAs, close, view, fullscreen, help, tutorial, shortcuts, credits, achievements, about }`;
   `DEFAULT_MENU_LABELS` (English); `isMenuLabels(value): value is MenuLabels` (every key a string);
   `type HelpAction = 'tutorial' | 'shortcuts' | 'credits' | 'achievements'`;
   `helpMenuTemplate(labels, send: (a: HelpAction) => void, platform: NodeJS.Platform, about?: MenuItemConstructorOptions)`;
   `viewMenuTemplate(labels, state: { fullscreen: boolean; toggle: () => void })` → `{ label: labels.view, submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { label: labels.fullscreen, type: 'checkbox', checked, accelerator: platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11', click: toggle }] }`.
4. `electron/main.ts`: delete the local `MenuLabels`, defaults and `isMenu`; import from
   `./menuLabels`. `installMenu()` uses `helpMenuTemplate(menuLabels, (a) => currentWindow()?.webContents.send('nestwright:help', a), process.platform, about)`
   — keep sending `nestwright:show-achievements` for `achievements` so `achievements/boot.ts` keeps
   working — and `viewMenuTemplate(menuLabels, { fullscreen: currentWindow()?.isFullScreen() ?? false, toggle })`
   where `toggle` flips `win.setFullScreen(!win.isFullScreen())`. In `createWindow`, on
   `enter-full-screen`/`leave-full-screen` send `nestwright:fullscreen` with the boolean and call
   `installMenu()` (checkbox state). In the `editor-state` handler accept `body.fullscreen: boolean`
   and, when it differs from `win.isFullScreen()`, apply it.
5. `electron/preload.ts`: `setEditorState` type gains `fullscreen: boolean` and `menu: MenuLabels`;
   add `onHelp(cb: (action: HelpAction) => void)` (channel `nestwright:help`) and
   `onFullscreen(cb: (on: boolean) => void)` (channel `nestwright:fullscreen`). Mirror both in
   `src/platform/global.d.ts`.
6. `src/settings/index.ts`: `fullscreen: boolean` (doc: "Desktop only; mirrors the window state."),
   default `false`, normalise `=== true`. `SettingsDialog.tsx` General tab: checkbox `Fullscreen`
   shown when `getPlatform().isElectron`.
7. `src/ui/documentSession.ts` `syncChrome()`: send `fullscreen: useSettings.getState().fullscreen`
   and the full label set (`view: translate(language, 'View')`, `fullscreen: 'Fullscreen'`,
   `help: 'Help'`, `tutorial: 'Tutorial'`, `shortcuts: 'Shortcuts'`, `credits: 'Credits'`,
   `achievements: 'Achievements'`, `about: 'About Nestwright'`), and resync when `fullscreen`
   changes. In `installDocumentSession`: `api.onHelp` → `tutorial` → `replayTour()`; `shortcuts`/`credits`
   → `setHelpPage(page); setHelpOpen(true)`; `achievements` → `setHelpPage('achievements'); setHelpOpen(true)`.
   `api.onFullscreen` → `useSettings.getState().setSettings({ fullscreen: on })`.
8. `src/ui/PauseMenu.tsx` Quit: keep `getPlatform().quit?.()`; add a comment that
   `nestwright:quit` → `app.quit()` → `before-quit` runs the dirty prompt. Verify by reading
   `electron/main.ts` L888–898; no code change expected.
9. Strings `en.ts` + `pt.ts`: `Tutorial` → `Tutorial` (add to `SAME_IN_PT` in
   `tests/i18n/coverage.test.ts` — this is the one allowed test edit, an additive list entry);
   `Fullscreen` → `Ecrã inteiro`; `About Nestwright` → `Acerca do Nestwright`; `View` → `Ver` if missing.

## Tests to add
- `tests/electron/menuLabels.test.ts`, `tests/settings/fullscreen.test.ts` as above.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/electron tests/settings tests/i18n tests/ui` green.
- `npm run build` green (esbuild bundles `electron/menuLabels.ts` into `dist-electron/main.cjs`).
- `grep -n "'About Nestwright'\|'Achievements'\|label: 'Help'" electron/main.ts` prints nothing.
- `npm run electron:dev` (reviewer runs it): switch language to Portuguese → the menu bar reads
  Ficheiro / Ver / Ajuda; Help → Tutorial shows the coach mark; View → Ecrã inteiro toggles and the
  Settings checkbox follows; Esc → Quit with unsaved changes shows the Save prompt.

## Out of scope / forbidden
- Do not edit existing tests (except the additive `SAME_IN_PT` entry) or existing user-facing strings.
- Do not touch the Steam, coop or photo3d IPC.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
