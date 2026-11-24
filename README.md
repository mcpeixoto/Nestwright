# Nestwright

[![CI](https://github.com/mcpeixoto/Nestwright/actions/workflows/ci.yml/badge.svg)](https://github.com/mcpeixoto/Nestwright/actions/workflows/ci.yml)
[![Licence: GPL-3.0-only](https://img.shields.io/badge/licence-GPL--3.0--only-blue.svg)](LICENSE)
[![Latest build](https://img.shields.io/github/v/release/mcpeixoto/Nestwright?include_prereleases&filter=v*&label=build)](https://github.com/mcpeixoto/Nestwright/releases)

A home-design game for two. Draw a floor plan in 2D and walk through it in 3D as you
build: walls, doors and windows, several floors, roofs, stairs, furniture, a garden
and a pool. Two people can design the same house together over a local network.

![A two-storey family house seen from above with the roof cut away: bedrooms, a bathroom, the garden, trees and a pool](https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/hero-aerial.jpg)

Nestwright is in early development. It is not on Steam yet, and the plan towards a
first release lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Screenshots

<table>
  <tr>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/facade.jpg" alt="Front of the family house behind trees and a hedge"></td>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/dusk.jpg" alt="The house at dusk under a pink sky, with a pool and long grass"></td>
  </tr>
  <tr>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/living-day.jpg" alt="Living room in daylight with a leather sofa, armchairs and a side table"></td>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/living-evening.jpg" alt="The same living room in the evening, lit by a pendant, a wall light and a floor lamp"></td>
  </tr>
  <tr>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/pool.jpg" alt="The pool and garden path beside the house"></td>
    <td><img src="https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/main-menu.jpg" alt="The main menu: Continue, New house, Open, recent projects, Settings and Credits"></td>
  </tr>
</table>

The editor: tools on the left, the 3D view in the middle, details of the selection on
the right, floors and areas along the bottom.

![The editor showing the family house in 3D, with the tool rail, the level inspector and the floor bar](https://github.com/mcpeixoto/Nestwright/releases/download/readme-media/editor.jpg)

These are real-time captures from v0.16.0, not offline renders.

## What it does today

- Plan editor with exact sizes, levels, roofs, stairs and openings, plus floor-plan
  tracing from an image.
- Live 3D and first-person walk views on a WebGPU renderer (WebGL 2 fallback).
- 99 surface materials, 88 of them from scanned CC0 texture sets, and about 115 pieces
  of furniture, 22 of them with scanned models.
- Budget with your own quotes, two design variants side by side, and a printable PDF plan.
- House Briefs: twelve design challenges with scoring.
- Co-op editing for two over the local network.
- English and European Portuguese.

## Download

Test builds for macOS (universal, Apple silicon and Intel) are attached to each
[release](https://github.com/mcpeixoto/Nestwright/releases). They are pre-releases:
expect rough edges, and keep backups of houses you care about. The builds are not
signed, so on first launch macOS refuses to open them: right-click the app, choose
Open, then Open again.

## Running it from source

You need Node 22 and npm.

```bash
npm ci
npm run content:fetch   # downloads the scanned texture and model pack (CC0)
npm run dev             # browser build at http://localhost:5173
npm run electron:dev    # desktop app
```

Without `content:fetch` the game still runs, with procedural materials only.

Checks that must pass before a change is merged:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the store, the plan and 3D
coordinate systems and the registries a feature plugs into.

## Licence

The source code is licensed under the GNU General Public License v3.0 only
(GPL-3.0-only). See [LICENSE](LICENSE).

Third-party assets keep their own licences. Scanned textures and models are CC0 or
CC-BY 4.0, bundled fonts are OFL-1.1, and each one is listed in
[docs/ASSETS.md](docs/ASSETS.md). CC-BY assets are also credited on the in-game
Credits screen.

The name "Nestwright" and its logo are not covered by the GPL.

Copyright © 2026 Peixoto Labs.
