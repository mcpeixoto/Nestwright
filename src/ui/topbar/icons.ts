/** Stroke icons for the top bar. 20×20 viewBox, drawn for this screen. */
function glyph(body: string): string {
  return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

export const undoIcon = glyph('<path d="M4.5 8.5h7.2a3.8 3.8 0 1 1 0 7.6H9"/><path d="M7.2 5.6 4.2 8.5l3 2.9"/>')

export const redoIcon = glyph('<path d="M15.5 8.5H8.3a3.8 3.8 0 1 0 0 7.6H11"/><path d="M12.8 5.6 15.8 8.5l-3 2.9"/>')

export const wishesIcon = glyph(
  '<path d="M10 16.2s-5.6-3.3-5.6-7.1c0-1.8 1.4-3.1 3.1-3.1 1 .1 1.9.6 2.5 1.5.6-.9 1.5-1.4 2.5-1.5 1.7 0 3.1 1.3 3.1 3.1 0 3.8-5.6 7.1-5.6 7.1z"/>',
)

export const variantsIcon = glyph(
  '<path d="M10 16.5V10.5"/><path d="M10 10.5 5 5.5"/><path d="M10 10.5 15 5.5"/><path d="M3.8 5.5h2.4"/><path d="M13.8 5.5h2.4"/>',
)

export const togetherIcon = glyph(
  '<circle cx="7" cy="7.2" r="1.7"/><circle cx="13.2" cy="7.2" r="1.7"/><path d="M3.6 15.2c.4-2 1.8-3 3.4-3s3 .9 3.4 3"/><path d="M9.8 15.2c.4-2 1.8-3 3.4-3s3 .9 3.4 3"/>',
)

export const photoIcon = glyph(
  '<path d="M4 8h2.6l1.1-1.7h4.6L13.4 8H16a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="10" cy="12" r="2.1"/>',
)

export const exportIcon = glyph('<path d="M8 4.5H4.5V15.5H15.5V12"/><path d="M10.5 9.5 15.5 4.5"/><path d="M11.5 4.5h4v4"/>')

export const saveIcon = glyph('<path d="M5 3.8h7.2L16.2 8v8.2H5z"/><path d="M7.2 3.8v3.6h4.2"/><path d="M7.2 16.2v-3.4h5.6v3.4"/>')
