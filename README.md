# Nestwright

A home-design game for two. Draw a floor plan in 2D and walk through it in 3D as you
build: walls, doors and windows, several floors, roofs, stairs, furniture, a garden
and a pool. Two people can design the same house together over a local network.

Nestwright is in early development. It is not on Steam yet, and the plan towards a
first release lives in [docs/ROADMAP.md](docs/ROADMAP.md).

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

## Running it

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
