/**
 * Set while the primary view precompiles its pipelines. three's PassNode.compileAsync leaves the
 * scene pass's MRT and render target set on the renderer across its awaits, so any other render
 * in that window (the PMREM sky capture, a thumbnail) would be drawn into the G-buffer layout and
 * fail. Code that renders outside the frame loop checks this and retries later.
 */
let held = 0

export function holdRendering(on: boolean): void {
  held = Math.max(0, held + (on ? 1 : -1))
}

export function renderingHeld(): boolean {
  return held > 0
}
