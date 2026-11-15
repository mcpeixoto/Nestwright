# Content pipeline

Offline tools that turn CC0 and CC-BY 4.0 sources into the files under `public/content/`. The game reads `public/content/index.json` (written by `process.mjs` and `pack.mjs`) and loads each material's KTX2 set from it; `src/materials/pbrTextures.ts` is the loader. Without a pack every material stays procedural.

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

ambientCG's `dimensionX` is centimetres (`Concrete034` reports 110 for a 1.1 m tile).

Optional on texture entries: `albedoContrast` (0–1, default 1) lerps the albedo toward its mean in linear light before encoding, and AO toward white by the same factor. Painted plaster is nearly one colour, so its character has to come from the normal and roughness maps. `normalScale` (default 1) sets the normal strength in the game; plaster uses about 0.5.

`kind` is `texture`, `model` or `hdri`. `provider` is `polyhaven`, `ambientcg`, `sketchfab` or `local`. `resolution` is `1k`, `2k` or `4k`. Optional `units` is `m` (default), `cm` or `mm` and applies to models. Optional `tileMeters` is the fallback real-world width of one texture repeat.

## Commands

```bash
npm run content:build          # fetch → process → validate → docs
npm run content:fetch          # download the pack named in content/lock.json
npm run content:pack           # tar public/content and write the lock
npm run content:pack -- --gzip # .tar.gz even when zstd is installed (any tar extracts it)
node scripts/content/fetch.mjs --dry-run
node scripts/content/process.mjs --only oak-planks --webp
node scripts/content/process.mjs --stats   # recompute texture.meanOrm from the cache, no encoding
```

A texture manifest records `meanAlbedoSrgb` and `meanOrm` (mean AO, roughness, metalness, 0–1). The game divides the material's roughness and metalness by the ORM means so a scan keeps its variation but averages to the library value, and pulls the albedo toward the library colour (see `albedoTint`). Albedo sizes are rounded down to a multiple of 4, because WebGPU rejects block-compressed textures of any other size.

Normals are UASTC with `--normal_mode`, i.e. two channels (X in RGB, Y in alpha). The game reads them with three's `NormalGAPacking`, not as an XYZ `normalMap`.

In the packaged app, `public/content` ships as `Resources/content` (electron-builder `extraResources`) and is served on `nwcontent://content/`; `nwcontent://basis/` serves the KTX2 transcoder. A pack extracted to `<userData>/content` also works.

Every script accepts `--help` and `--dry-run`. A failure exits non-zero.

`KTX_BIN` is the directory that contains `toktx` and `ktx` (default `~/.local/opt/ktx/bin`). If that directory has no `toktx`, the encoder falls back to `ktx create`, then to `toktx` on `PATH`. toktx 4.4.2 is not deprecated, so the pipeline calls it:

- albedo: `toktx --t2 --encode etc1s --clevel 4 --qlevel 192 --genmipmap --assign_oetf srgb`
- ORM: the same with `--assign_oetf linear` (R = AO or white, G = roughness, B = metalness or black)
- normal: `toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --normal_mode --assign_oetf linear`

`--webp` on `process.mjs` keeps model textures as WebP when KTX-Software is not installed. Texture sets are still KTX2.

Poly Haven requests send `User-Agent: Nestwright-content-pipeline/1.0`. The API is the only source; HTML pages are not scraped. Sketchfab and local entries are not downloaded: `author`, `url` and `licence` must be on the entry, and the files must already be in the cache directory.

`content/lock.json` starts with `"tarball": null`. `npm run content:fetch` then prints `no content pack; procedural fallback` and exits 0. After `content:pack`, the lock names `content-vN.tar.zst` (or `.tar.gz`) and its sha256. The archive's top folder is `content/`, so extracting it with `-C public` recreates `public/content`.
