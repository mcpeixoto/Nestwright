# Content pipeline

Offline tools that turn CC0 and CC-BY 4.0 sources into the files under `public/content/`. Nothing here is loaded by the game until a later phase. `src/` is unchanged.

`content/sources.json` is the wish-list. It starts empty. JSON has no comments, so the three starter entries live here:

```json
{
  "key": "oak-planks",
  "kind": "texture",
  "provider": "polyhaven",
  "sourceId": "wood_floor_deck",
  "resolution": "2k",
  "licence": "CC0",
  "targets": { "materialId": "oak-planks" },
  "notes": "Poly Haven dimensions (mm) become tileMeters."
}
```

```json
{
  "key": "wood-floor-acg",
  "kind": "texture",
  "provider": "ambientcg",
  "sourceId": "WoodFloor024",
  "resolution": "1k",
  "licence": "CC0",
  "tileMeters": 2,
  "targets": { "materialId": "oak-planks" },
  "notes": "tileMeters is used when the API dimension is 0."
}
```

```json
{
  "key": "armchair-scanned",
  "kind": "model",
  "provider": "sketchfab",
  "sourceId": "armchair-scan",
  "resolution": "1k",
  "licence": "CC-BY-4.0",
  "author": "Example Author",
  "url": "https://sketchfab.com/3d-models/example",
  "units": "m",
  "targets": { "catalogId": "armchair-wingback" },
  "notes": "No download. Put the .gltf and its files in content/cache/sketchfab/armchair-scan/1k/."
}
```

`kind` is `texture`, `model` or `hdri`. `provider` is `polyhaven`, `ambientcg`, `sketchfab` or `local`. `resolution` is `1k`, `2k` or `4k`. Optional `units` is `m` (default), `cm` or `mm` and applies to models. Optional `tileMeters` is the fallback real-world width of one texture repeat.

## Commands

```bash
npm run content:build          # fetch → process → validate → docs
npm run content:fetch          # download the pack named in content/lock.json
npm run content:pack           # tar public/content and write the lock
node scripts/content/fetch.mjs --dry-run
node scripts/content/process.mjs --only oak-planks --webp
```

Every script accepts `--help` and `--dry-run`. A failure exits non-zero.

`KTX_BIN` is the directory that contains `toktx` and `ktx` (default `~/.local/opt/ktx/bin`). If that directory has no `toktx`, the encoder falls back to `ktx create`, then to `toktx` on `PATH`. toktx 4.4.2 is not deprecated, so the pipeline calls it:

- albedo: `toktx --t2 --encode etc1s --clevel 4 --qlevel 192 --genmipmap --assign_oetf srgb`
- ORM: the same with `--assign_oetf linear` (R = AO or white, G = roughness, B = metalness or black)
- normal: `toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --normal_mode --assign_oetf linear`

`--webp` on `process.mjs` keeps model textures as WebP when KTX-Software is not installed. Texture sets are still KTX2.

Poly Haven requests send `User-Agent: Nestwright-content-pipeline/1.0`. The API is the only source; HTML pages are not scraped. Sketchfab and local entries are not downloaded: `author`, `url` and `licence` must be on the entry, and the files must already be in the cache directory.

`content/lock.json` starts with `"tarball": null`. `npm run content:fetch` then prints `no content pack; procedural fallback` and exits 0. After `content:pack`, the lock names `content-vN.tar.zst` (or `.tar.gz`) and its sha256. The archive's top folder is `content/`, so extracting it with `-C public` recreates `public/content`.
