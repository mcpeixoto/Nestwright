# Photo-to-3D converter

The local converter behind **Library › From photo…**. It runs on this Mac only: nothing is
uploaded, and it is not part of the app bundle.

## Install

```bash
scripts/photo3d/setup.sh
```

This installs into `~/Library/Application Support/Nestwright/photo3d`, where the app finds it
with no setting. Pass another folder as the first argument and set that `photo3d.sh` path in
**Settings › Photo to 3D converter** (or `NESTWRIGHT_PHOTO3D`). The order is: setting, then
`NESTWRIGHT_PHOTO3D`, then the default folder.

## Contract

```
photo3d.sh --out <file.glb> [--engine triposg|triposr] [--quality fast|best] <image>...
stdout: PROGRESS <0..1> <stage>   …   DONE <path> (exit 0)  |  ERROR <message> (exit ≠ 0)
```

The GLB is Y-up, standing on y = 0, centred, front towards +Z, at most 30k triangles, with one
1024² texture baked from the photo. The app scales it to the real size typed in the dialog.

## Engines

| Quality | Engine | Licence | Time on an M4 (24 GB) | Peak memory |
|---------|--------|---------|-----------------------|-------------|
| Best    | TripoSG, 25 steps | MIT | 6.5–9 min | ~9 GB |
| Fast    | TripoSR | MIT | ~1 min | ~6 GB |

Background removal is BiRefNet (MIT) on the GPU at 768 px (~3.7 GB peak); photos that already
have transparency skip it. The model code in `vendor/birefnet_code` is from
`ZhengPeng7/BiRefNet` at `e2bf8e4` (MIT).

Not used: Hunyuan3D (licence excludes the EU), TRELLIS.2 (needs a gated DINOv3 licence),
Pixal3D (weights exclude the EU), RMBG-1.4/2.0 (non-commercial).

## Known limits

- One photo is used for the shape; the unseen back is filled from the mirror side and nearby
  colours, so it reads right from a distance but is patchy up close.
- Thin legs and arms get filled colour rather than photo detail.
- A low, close photo can shift the texture slightly (the camera fit is orthographic).
