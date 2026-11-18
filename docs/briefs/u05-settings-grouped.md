# u05 — Settings grouped into tabs, reset, one units setter

**Epic:** UI shell **Release:** v0.16.0 **Owner model:** grok-4.7-medium
**Depends on:** u01
**Time box:** ≤ 20 min of agent work

## Goal
Settings opens on five tabs — General, Graphics, Controls, Sound, Advanced — instead of one
long form. Sliders show their value. A "Reset to defaults" button restores every preference
except brief progress. Units has one setter that both the Settings select and the status-bar
toggle call, so the two can no longer disagree. Technical fields carry a line of help text.

## Context the implementer needs
- `src/ui/SettingsDialog.tsx`: one `Modal`, fields in source order Language, Theme (u01), Units
  (also rewrites `draft.units`, L66–72), Graphics, Pick graphics automatically, Render scale,
  Renderer, Tone mapping, Exposure compensation (has `.readout`), Mouse sensitivity (no readout),
  Invert Y, Autosave, Show FPS, Show tool labels, UI scale (no readout), Continue last project,
  Photo to 3D converter (desktop), Sound ×3 + Mute, Player name/Colour (co-op).
- Tab pattern: `src/ui/HelpDialog.tsx` L128–157 `div.modal-switch[role=tablist]` with
  `button[role=tab][aria-selected]`.
- `src/ui/settingsDialogState.ts`: open flag module; add the tab there.
- `src/settings/index.ts`: `DEFAULT_SETTINGS`, `normalizeSettings`, `useSettings` with
  `setSettings`, `persist`. `briefStars` is progress, not a preference.
- `src/ui/StatusBar.tsx` L37–46: the Metric/Imperial button changes only `project.units`.
- `src/ui/confirm.tsx` `confirmIfNeeded(message, then)`.
- Strings: `General`, `Graphics`, `Sound`, `Units`, `Metric`, `Imperial` exist. New keys go in
  `en.ts` and `pt.ts` (pt-PT).

## Steps
1. `tests/settings/reset.test.ts` (new): `useSettings.getState().setSettings({ showFps: true, uiScale: 1.2, briefStars: { cottage: 2 } })`;
   `resetSettings()`; expect `showFps === false`, `uiScale === 1`, `briefStars` still `{ cottage: 2 }`,
   `theme === 'cozy'`, `qualityAuto === false`.
2. `tests/settings/units.test.ts` (new): `setUnits('imperial')` → `useSettings.getState().units === 'imperial'`
   and `useStore.getState().project.units === 'imperial'`; `setUnits('metric')` reverts both;
   `canUndo` is true after a call (it went through `apply`).
3. `tests/ui/settingsTabs.test.tsx` (new, jsdom): `setSettingsOpen(true)`, render `<SettingsDialog />`;
   five `[role="tab"]` named General, Graphics, Controls, Sound, Advanced; General shows the
   `Language` select and no `Pick graphics automatically` checkbox; click Graphics → the checkbox
   appears and `Language` is gone; Controls shows a `.readout` reading `1.0×` for the default mouse
   sensitivity; every tab shows a button `Reset to defaults`; `afterEach` → `setSettingsOpen(false)`,
   `setSettingsTab('general')`.
4. `src/settings/index.ts`: `export function resetSettings(): void` — 
   `const next = normalizeSettings({ ...DEFAULT_SETTINGS, briefStars: useSettings.getState().briefStars }); useSettings.setState(next); persist(next)`.
5. `src/settings/units.ts` (new): `export function setUnits(units: UnitSystem): void` — 
   `useSettings.getState().setSettings({ units })` then
   `useStore.getState().apply('Units', (draft) => { draft.units = units })` (skip `apply` when the
   project already has those units). Import `UnitSystem` from `../model/units`.
6. `src/ui/StatusBar.tsx`: the Metric/Imperial button calls `setUnits(units === 'metric' ? 'imperial' : 'metric')`.
7. `src/ui/settingsDialogState.ts`: `export type SettingsTab = 'general' | 'graphics' | 'controls' | 'sound' | 'advanced'`,
   `settingsTab()`, `setSettingsTab()`, same listener set.
8. `src/ui/SettingsDialog.tsx`: read the tab with `useSyncExternalStore`; render the tablist after
   the `<h2>`; then one `<div className="settings-page">` per tab:
   - General: Language, Theme, Units (`onChange` → `setUnits(...)`), Autosave, Continue last project,
     UI scale with `<span className="readout">{Math.round(uiScale * 100)}%</span>`.
   - Graphics: Graphics, Pick graphics automatically, Show FPS.
   - Controls: Mouse sensitivity with readout `${mouseSensitivity.toFixed(1)}×`, Invert Y, Show tool labels.
   - Sound: the three volumes and Mute (unchanged markup).
   - Advanced: Render scale, Renderer, Tone mapping, Exposure compensation, Photo to 3D converter
     (desktop), Player name + Colour (co-op). Under each of the first four add
     `<span className="hint"><T k="…" /></span>` with the texts in step 10.
   Footer under every page: `<button type="button" className="danger" onClick={() => confirmIfNeeded(tr('Reset all settings to their defaults?'), resetSettings)}>` labelled `Reset to defaults`.
9. `src/ui/styles.css`: `.settings-dialog { width: 520px; max-height: 80vh; display: flex; flex-direction: column; } .settings-page { display: flex; flex-direction: column; gap: var(--s3); overflow: auto; padding: var(--s2) 0; } .settings-foot { margin-top: auto; padding-top: var(--s3); border-top: 1px solid var(--line); }`.
10. Strings `en.ts` + `pt.ts`: `Controls` → `Controlos`; `Advanced` → `Avançado`;
    `Reset to defaults` → `Repor predefinições`; `Reset all settings to their defaults?` →
    `Repor todas as definições?`; `Lower values draw fewer pixels and run faster.` →
    `Valores mais baixos desenham menos píxeis e correm mais depressa.`;
    `WebGPU is faster where available; WebGL 2 works everywhere.` → `WebGPU é mais rápido onde existe; WebGL 2 funciona em todo o lado.`;
    `How bright colours roll off into white.` → `Como as cores fortes se fundem no branco.`;
    `Nudges the automatic exposure darker or brighter.` → `Ajusta a exposição automática para mais escuro ou mais claro.`.

## Tests to add
- `tests/settings/reset.test.ts`, `tests/settings/units.test.ts`, `tests/ui/settingsTabs.test.tsx` as above.

## Acceptance
- `npm run typecheck && npm run lint && npm test -- tests/settings tests/ui tests/i18n` green.
- `grep -n "draft.units" src/ui/SettingsDialog.tsx src/ui/StatusBar.tsx` prints nothing (only `src/settings/units.ts` writes it).
- `npm run dev`: Settings shows tabs; dragging UI scale shows `110%`; status-bar `Metric` click flips the Settings select too; Reset restores defaults after confirming.

## Out of scope / forbidden
- Do not edit existing tests or existing user-facing strings (field labels keep their current keys; u12 renames them).
- Do not move settings between the store and the project.
- Do not start a dev server in the agent run. Do not commit, push or merge.
- No new dependencies.
