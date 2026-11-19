# Nestwright — design spec

A home-design sandbox for two people planning a real home together. Draw a floor plan, see it
in 3D instantly, shape the plot around it, furnish it, light it, walk through it — on the same
project at the same time over the local network.

Genre reference: parametric home-planner games (2D plan ↔ live 3D, furnishing, garden, sun).
Nestwright is its own game: its own name, UI, art, assets and feature set. No assets, names,
text or visual identity are taken from any existing product. Base-game 3D assets may be
procedural, CC0, or CC-BY 4.0 (with credit). NC, ND, and SA licences are forbidden. Every
third-party asset is logged in `docs/ASSETS.md`, and CC-BY assets are credited in the game.
Binaries stay out of git; content packs ship as release tarballs.

## Target

- **Platform now:** macOS (Apple Silicon) desktop app, runnable in a browser for development.
- **Platform later:** Steam (macOS + Windows), via Electron + steamworks.js.
- **Players:** 1–2 (co-op over LAN), designed for couples planning a home.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | one language for app, tools, tests |
| Build | Vite | fast dev loop, browser-testable |
| UI | React 19 + CSS modules | panels, inspectors, dialogs |
| State | zustand + immer (with patches) | undo/redo and co-op sync both fall out of immer patches |
| 3D | three.js (plain, imperative) | full control of generated geometry; no r3f layer to fight |
| 2D plan | Canvas 2D | crisp lines, cheap, testable maths |
| Desktop | Electron | proven on Steam, steamworks.js binding exists |
| Tests | vitest (unit), Playwright (smoke) | |

## Architecture

```
src/
  model/        pure data types + pure functions (no three, no DOM). Fully unit tested.
    types.ts    Project, Level, Wall, Opening, Room, Stair, Roof, Item, Terrain, Environment…
    geometry.ts vector maths, polygon area, point-in-polygon, segment intersection
    rooms.ts    room detection: planar graph of walls → faces → Room polygons + area
    ops/        pure "commands" (addWall, splitWall, moveItem…) operating on a draft
  store/        zustand store: project + selection + tool state; undo/redo from immer patches
  plan2d/       Canvas plan renderer + input → active tool
  view3d/       three.js scene builder: model → meshes; camera rigs (orbit, walk); lighting
  builders/     model → three geometry (walls with openings, floors, roofs, stairs, terrain)
  catalog/      procedural furniture/fixture catalog (each entry: params → THREE.Group)
  materials/    procedural textures (canvas-generated) + material library
  tools/        editor tools, one file each, registered in tools/index.ts
  ui/           React shell: top bar, tool rail, inspector, library browser, dialogs
  net/          co-op session (WebSocket) — patch broadcast + presence
  io/           save/load (.nest JSON), import (image/PDF trace, GLB/OBJ), export (PNG, PDF, GLB)
  platform/     web vs electron bridge (file dialogs, steam)
electron/       main process, preload, steam bridge, co-op host server
```

Rules:
- `model/` never imports three, React or DOM. Everything there is a pure function with tests.
- The 3D scene is a **projection** of the model: the scene builder diff-rebuilds per level/object
  on store change. Nothing in the scene is the source of truth.
- Units are metres internally. Plan point (x, y) maps to world (x, elevation, y) in a y-up
  world. One mapping function (`planToWorld`), used everywhere.
- Every mutation goes through the store's `apply(label, recipe)` so undo/redo and co-op work.

## Feature set (v1)

### Plan & structure
- Wall tool: click-chained walls, grid + endpoint + angle (15°) snapping, live length labels,
  thickness/height per wall, interior/exterior materials per side.
- Curved walls (bulge parameter), wall split/join, drag endpoints (connected walls follow).
- Room detection: closed wall loops become rooms automatically with area (m²) label, name,
  room type (living, kitchen, bedroom, bath, …) with floor material per room.
- Openings: doors (single, double, sliding, garage), windows (casement, fixed, floor-to-ceiling,
  round), placed on walls, width/height/sill editable, cut real holes in 3D.
- Levels: add/remove storeys, per-level height; slabs and ceilings auto from rooms; level switcher
  (show all / current / current + below ghosted).
- Stairs: straight, L, U, spiral; steps computed from level height (riser ≤ 0.19 m), cut stair hole.
- Roofs: flat, shed, gable, hip, mansard; pitch + overhang; auto from outer wall outline of a level.
- Skylights, balconies/railings, columns.
- Measure tool and dimension lines.
- Trace: import an image or PDF page as plan underlay, calibrate scale by clicking a known length.

### Interior
- Procedural furniture library (≥ 60 items across living, dining, bedroom, kitchen, bath, office,
  outdoor, lighting, decor, plants), each parametric (size, colours).
- Kitchen configurator: base/wall cabinet runs along a wall, island, sink, hob, oven, fridge,
  worktop material, handle style.
- Move / rotate / scale in 2D and 3D, snap to walls, duplicate, multi-select.
- Materials: library of procedural PBR-ish materials (wood, tile, stone, concrete, plaster,
  brick, fabric, metal, glass) + colour tint; eyedropper (Alt-click) picks a material, click paints.
- Import own models (GLB/glTF, OBJ).
- Lights: placeable lamps that actually light the scene at night, toggle on/off in walk mode.

### Outside
- Plot: terrain heightmap with sculpt brushes (raise, lower, flatten, smooth).
- Paint brush layers: lawn, meadow, gravel, paving, sand, soil, path.
- Water: ponds and pools (shaped polygons), fountains.
- Vegetation scatter brush: trees (several species), bushes, flowers, hedges.
- Fences, gates, decking, driveway.
- Facade: ivy painting on walls.

### Atmosphere & explore
- Sun from date, time and latitude; sky, fog; time-of-day slider; night with emissive windows.
- Weather: clear, cloudy, rain, snow.
- Views: 2D plan, 3D orbit, split, first-person walk (WASD + mouse, collision with walls,
  stairs climbable), cat mode (low camera, can jump on furniture).
- Photo mode: FOV, depth of field, exposure, hide UI, PNG export at chosen resolution.
- Camera flight: record keyframes, play back, export as WebM video.

### Together (beyond the genre baseline)
- **Co-op over LAN:** one player hosts, the other joins by address + 4-letter code. Both edit live;
  presence cursors and names on the plan and in 3D.
- **Wishes board:** each partner marks items/rooms with ❤ / ✕ and short notes; pins on the plan.
- **Variants:** snapshot the design as named variants, switch, compare two side by side.
- **Budget:** price per item + construction estimate per m² per finish; live total by room.
- **Room checklist:** brief per room ("bath must have tub") that ticks itself when satisfied.

### Projects & output
- Start screen: new from template, open, recent; templates: empty plot, studio apartment,
  2-bed apartment, apartment floor, bungalow, two-storey family house, beach house.
- Apartment mode: no terrain, building shell + unit boundary, balcony.
- Save/load `.nest` (JSON, versioned with migrations), autosave, recent list.
- Export: plan PDF with dimensions and areas, PNG renders, GLB of the whole house.
- Settings: units (metric/imperial), graphics quality presets, language (en, pt), key bindings help.

### Steam readiness
- Electron packaging (electron-builder) → signed-ready `.app`/`.dmg` for macOS arm64.
- steamworks.js bridge loaded only when `steam_appid.txt` / Steam present; achievements table;
  Workshop share planned (projects are single JSON files, easy to upload).
- Store-page checklist in `docs/STEAM.md`.

## Visual identity
The app opens warm and light. Cream page (`--paper` #F6F1E7), off-white panels (`--panel` #FFFDF8),
ink text (`--ink` #2B2620), terracotta accent (`--accent` #C8643B), sage (`--sage` #6F8F72) for active
states, rounded corners and soft shadows. Headings use Fraunces. Night, chosen in Settings, is the
alternate theme: the pre-0.16 dark look, with slate panels, sand accent (#E8B86D) and teal (#3FB8AF)
for active states. Layout stays a left vertical tool rail, right inspector, and top bar with the view
switcher. Plan view: off-white paper with a soft grid, charcoal walls, pastel room fills by room type.

## Out of scope for v1
Ray tracing, VR, DWG/DXF import, Steam Workshop upload (designed for, not built).
