# Architecture

Nestwright is a 2D plan and a 3D view of one project. The project is plain data.
Everything on screen is derived from it. Add a feature by registering it; the shells
already walk the registries.

## Store

Every edit goes through `apply`. The recipe gets an immer draft. The patches it
produces are the undo stack and, later, the co-op stream. Do not write to `project`
any other way.

```ts
useStore.getState().apply('Wall height', (draft) => {
  const level = draft.levels.find((l) => l.id === levelId)
  const wall = level?.walls.find((w) => w.id === wallId)
  if (wall) wall.height = 2.7
})
```

`src/model/` is pure: no three, React or DOM. A new field on `src/model/types.ts`
needs a migration in `src/io/migrate.ts` and a bump of `PROJECT_VERSION`.

## Plan ↔ world

Units are metres. Plan `(x, y)` maps to world `(x, elevation, y)` in a y-up scene.
`planToWorld` in `src/model/geometry.ts` is the only mapping. The 2D canvas uses the
same numbers; it does not have its own coordinate system.

## Registries

Registering the same `id` again replaces that entry. Scene layers also remount
anything already on screen.

### Inspector — `src/ui/inspector/registry.ts`

Built-in sections live in `src/ui/inspector/sections/`. An empty selection is the
level section (`id: 'level'`).

```tsx
registerInspectorSection({
  id: 'stair',
  order: 30,
  title: 'Stair',
  match: (selection, state) => selectionIsStair(selection, state),
  Component: StairSection,
})
```

### Panels — `src/ui/panels/registry.ts`

`placement` is `'left' | 'right' | 'bottom' | 'floating'`. A rail button (left/right)
or a top-bar button (bottom/floating) is rendered for you. The furniture library is
`id: 'library'`.

```tsx
registerPanel({
  id: 'photos',
  title: 'Photos',
  placement: 'right',
  shortcut: 'p',
  Component: PhotoPanel,
})
```

### Top bar — `src/ui/topbar/registry.ts`

```tsx
registerTopBarAction({
  id: 'export-pdf',
  label: 'Export PDF',
  order: 50,
  run: () => exportPdf(),
})
```

### 3D layers — `src/view3d/layers.ts`

`SceneController` calls `sync` on store changes and `update` every frame.
`ground` and `atmosphere` are the built-ins. Replace one without touching the controller:

```ts
replaceSceneLayer('atmosphere', {
  id: 'atmosphere',
  create(ctx) {
    return { sync(project, state) {}, update(dt, elapsed) {}, dispose() {} }
  },
})
```

### Plan layers — `src/plan2d/layers.ts`

Drawn in `order`. Built-ins: grid 0, terrain 10, ghost 15, rooms 20, items 30,
walls 40, openings 50, labels 60, dimensions 80, overlays 100.

```ts
registerPlanLayer({
  id: 'plants',
  order: 25,
  draw(ctx2d, ctx) { /* ctx.worldToScreen, ctx.level, ctx.project */ },
})
```

Room names are drawn in the labels layer, at `polylabel` (`src/model/geometry.ts`),
above furniture. Item names show for the hovered or selected item, and for every
item when the zoom is more than twice the fitted zoom.

### Shortcuts — `src/ui/shortcuts.ts`

The help dialog lists `listShortcuts()`. `mod` means ⌘ on macOS and Ctrl elsewhere.

```ts
registerShortcut({
  id: 'photo',
  keys: 'mod+p',
  description: 'Photo mode',
  run: () => openPhoto(),
})
```

### Settings — `src/settings/index.ts`

`useSettings` is a separate zustand store, persisted to `localStorage` under
`nestwright:settings`. It is not part of the project file. Fields today:
`units`, `graphicsQuality` (`low | medium | high | ultra`), `language` (`'en'`),
`showFps`, `playerName`, `playerColor`. Extend the interface and `DEFAULT_SETTINGS`
together. Graphics quality already drives the shadow map and the pixel-ratio cap.

## Dev hook

`src/main.tsx` sets `window.__nestwright = { useStore, useSettings }` in every build
so a browser test can read state without clicking through the UI.

## Tests

Unit tests live in `tests/`, mirroring `src/` (`tests/model/geometry.test.ts` for
`src/model/geometry.ts`). `npm test` runs vitest. Model code should be tested there
before it is wired into a view. `npm run typecheck`, `npm run lint`, `npm test` and
`npm run build` all have to pass.
