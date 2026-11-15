/** Procedural material library. Colour is the flat fallback; `pattern` is drawn on a canvas. */

export type PatternKind =
  | 'none'
  | 'noise'
  | 'planks'
  | 'herringbone'
  | 'bricks'
  | 'tiles'
  | 'courses'
  | 'hex'
  | 'terrazzo'
  | 'marble'
  | 'fabric'
  | 'stripes'
  | 'floral'
  | 'checker'
  | 'weave'

export interface PatternSpec {
  kind: PatternKind
  /** Extra stops: grout, grain, veins. */
  colors?: string[]
  grout?: string
}

export interface MaterialDef {
  id: string
  name: string
  category: string
  color: string
  roughness: number
  metalness: number
  /** World metres covered by one texture repeat. Builders emit UVs in metres. */
  tileSize: number
  pattern: PatternSpec
  costPerM2?: number
}

export const MATERIALS: MaterialDef[] = [
  { id: 'plaster-white', name: 'White plaster', category: 'Plaster', color: '#d5d2cb', roughness: 0.92, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#d8d5ce', '#c9c3b8'] }, costPerM2: 18 },
  { id: 'plaster-warm', name: 'Warm plaster', category: 'Plaster', color: '#d4c4ae', roughness: 0.9, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#d8c9b4', '#c4b39c'] }, costPerM2: 18 },
  { id: 'paint-sage', name: 'Sage paint', category: 'Paint', color: '#b7c4ae', roughness: 0.55, metalness: 0, tileSize: 2, pattern: { kind: 'none' }, costPerM2: 12 },
  { id: 'paint-terracotta', name: 'Terracotta paint', category: 'Paint', color: '#c47a5a', roughness: 0.55, metalness: 0, tileSize: 2, pattern: { kind: 'none' }, costPerM2: 12 },
  { id: 'paint-navy', name: 'Navy paint', category: 'Paint', color: '#243044', roughness: 0.5, metalness: 0, tileSize: 2, pattern: { kind: 'none' }, costPerM2: 14 },
  { id: 'brick-red', name: 'Red brick', category: 'Masonry', color: '#8d4638', roughness: 0.86, metalness: 0, tileSize: 0.8, pattern: { kind: 'bricks', colors: ['#9a4e3c', '#7c3b2e'], grout: '#cbb7a2' }, costPerM2: 45 },
  { id: 'brick-white', name: 'White brick', category: 'Masonry', color: '#e4dcd2', roughness: 0.84, metalness: 0, tileSize: 0.8, pattern: { kind: 'bricks', colors: ['#efe6dc', '#d9cfc3'], grout: '#b7aa9c' }, costPerM2: 48 },
  { id: 'concrete', name: 'Concrete', category: 'Masonry', color: '#b7b4ae', roughness: 0.95, metalness: 0, tileSize: 1.2, pattern: { kind: 'noise', colors: ['#c5c2bb', '#a8a49c'] }, costPerM2: 28 },
  { id: 'stone-slate', name: 'Slate', category: 'Stone', color: '#6e7270', roughness: 0.78, metalness: 0.02, tileSize: 0.9, pattern: { kind: 'tiles', colors: ['#7b807c', '#5c6160'], grout: '#3e4240' }, costPerM2: 70 },
  { id: 'oak-planks', name: 'Oak planks', category: 'Wood', color: '#c4a574', roughness: 0.62, metalness: 0, tileSize: 1.2, pattern: { kind: 'planks', colors: ['#d2b48a', '#b8956a', '#a78458'] }, costPerM2: 55 },
  { id: 'walnut-planks', name: 'Walnut planks', category: 'Wood', color: '#6b4a33', roughness: 0.58, metalness: 0, tileSize: 1.2, pattern: { kind: 'planks', colors: ['#7a5538', '#5c3d28', '#4a301f'] }, costPerM2: 72 },
  { id: 'herringbone-oak', name: 'Herringbone oak', category: 'Wood', color: '#c9aa7c', roughness: 0.55, metalness: 0, tileSize: 0.8, pattern: { kind: 'herringbone', colors: ['#d4b48a', '#b89262'] }, costPerM2: 80 },
  { id: 'tile-white', name: 'White tile', category: 'Tile', color: '#f7f6f3', roughness: 0.35, metalness: 0, tileSize: 0.6, pattern: { kind: 'tiles', colors: ['#fbfaf7'], grout: '#d5d0c8' }, costPerM2: 40 },
  { id: 'tile-terrazzo', name: 'Terrazzo', category: 'Tile', color: '#e7e0d6', roughness: 0.32, metalness: 0, tileSize: 1, pattern: { kind: 'terrazzo', colors: ['#efe8de', '#c47a5a', '#3d6b66', '#d4b48a', '#243044'] }, costPerM2: 90 },
  { id: 'tile-hex', name: 'Hex tile', category: 'Tile', color: '#ece7df', roughness: 0.3, metalness: 0, tileSize: 0.5, pattern: { kind: 'hex', colors: ['#f4f0e8'], grout: '#c9c2b6' }, costPerM2: 64 },
  { id: 'marble', name: 'Marble', category: 'Stone', color: '#f3efe8', roughness: 0.22, metalness: 0.04, tileSize: 1.4, pattern: { kind: 'marble', colors: ['#f7f3ec', '#cfc4b4'] }, costPerM2: 120 },
  { id: 'carpet-grey', name: 'Grey carpet', category: 'Fabric', color: '#8d8a86', roughness: 1, metalness: 0, tileSize: 1, pattern: { kind: 'fabric', colors: ['#9a9691', '#7e7a76'] }, costPerM2: 32 },
  { id: 'fabric-linen', name: 'Linen', category: 'Fabric', color: '#e6dcc8', roughness: 0.95, metalness: 0, tileSize: 0.4, pattern: { kind: 'fabric', colors: ['#efe6d4', '#d9cdb4'] }, costPerM2: 36 },
  { id: 'fabric-velvet-green', name: 'Green velvet', category: 'Fabric', color: '#5e9b86', roughness: 0.85, metalness: 0, tileSize: 0.35, pattern: { kind: 'fabric', colors: ['#6aab96', '#4c8874'] }, costPerM2: 48 },
  { id: 'leather-brown', name: 'Brown leather', category: 'Fabric', color: '#6a432c', roughness: 0.55, metalness: 0.05, tileSize: 0.6, pattern: { kind: 'noise', colors: ['#7a4e34', '#5a3824'] }, costPerM2: 60 },
  { id: 'metal-black', name: 'Blackened metal', category: 'Metal', color: '#2a2c2e', roughness: 0.35, metalness: 0.85, tileSize: 1, pattern: { kind: 'noise', colors: ['#34373a', '#1e2022'] }, costPerM2: 40 },
  { id: 'metal-brass', name: 'Brass', category: 'Metal', color: '#c6a15a', roughness: 0.28, metalness: 0.9, tileSize: 0.5, pattern: { kind: 'none' }, costPerM2: 55 },
  { id: 'glass', name: 'Glass', category: 'Glass', color: '#d5e4ea', roughness: 0.05, metalness: 0, tileSize: 1, pattern: { kind: 'none' } },
  { id: 'grass', name: 'Lawn', category: 'Ground', color: '#6f8f4e', roughness: 0.95, metalness: 0, tileSize: 1.2, pattern: { kind: 'noise', colors: ['#7ea258', '#5d7a40'] } },
  { id: 'gravel', name: 'Gravel', category: 'Ground', color: '#b5aa9c', roughness: 0.98, metalness: 0, tileSize: 0.6, pattern: { kind: 'terrazzo', colors: ['#cfc4b4', '#a89884', '#8d8274', '#ddd4c6'] } },
  // Albedo, not the lit colour. Noon sun should read near sRGB (165, 85, 60).
  { id: 'roof-tiles', name: 'Roof tiles', category: 'Roof', color: '#b85a3c', roughness: 0.86, metalness: 0, tileSize: 1.8, pattern: { kind: 'courses', colors: ['#c4623e', '#a34b32'], grout: '#6a3428' }, costPerM2: 42 },
  { id: 'roof-metal', name: 'Standing seam', category: 'Roof', color: '#8d9290', roughness: 0.32, metalness: 0.7, tileSize: 0.8, pattern: { kind: 'planks', colors: ['#9aa09d', '#7e8482'] }, costPerM2: 38 },
  { id: 'wood-cladding', name: 'Wood cladding', category: 'Wood', color: '#b08968', roughness: 0.7, metalness: 0, tileSize: 1, pattern: { kind: 'planks', colors: ['#c29a74', '#9a7450', '#d0ae86'] }, costPerM2: 50 },
  { id: 'wallpaper-floral', name: 'Floral wallpaper', category: 'Paper', color: '#f3e6d8', roughness: 0.8, metalness: 0, tileSize: 0.6, pattern: { kind: 'floral', colors: ['#f7efe4', '#c47a5a', '#3d6b66', '#e8b86d'] }, costPerM2: 22 },
  { id: 'wallpaper-stripes', name: 'Striped wallpaper', category: 'Paper', color: '#efe6d4', roughness: 0.78, metalness: 0, tileSize: 0.5, pattern: { kind: 'stripes', colors: ['#f4ecdf', '#d7c4a4'] }, costPerM2: 20 },
  { id: 'plaster-pink', name: 'Pink plaster', category: 'Plaster', color: '#d4bfb6', roughness: 0.9, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#d8c8c0', '#c9b0a6'] }, costPerM2: 18 },
  { id: 'paint-ochre', name: 'Ochre paint', category: 'Paint', color: '#c8923a', roughness: 0.55, metalness: 0, tileSize: 2, pattern: { kind: 'noise', colors: ['#d4a24a', '#b07e2c'] }, costPerM2: 12 },
  { id: 'paint-charcoal', name: 'Charcoal paint', category: 'Paint', color: '#2c2e31', roughness: 0.5, metalness: 0, tileSize: 2, pattern: { kind: 'noise', colors: ['#3a3d41', '#232528'] }, costPerM2: 14 },
  { id: 'wood-cladding-dark', name: 'Dark cladding', category: 'Wood', color: '#4a3428', roughness: 0.68, metalness: 0, tileSize: 1, pattern: { kind: 'planks', colors: ['#5c4032', '#3a281e', '#6b4b38'] }, costPerM2: 54 },
  { id: 'polished-concrete', name: 'Polished concrete', category: 'Masonry', color: '#c5c2bb', roughness: 0.28, metalness: 0.04, tileSize: 1.4, pattern: { kind: 'noise', colors: ['#d0cdc6', '#b3b0a8'] }, costPerM2: 48 },
  { id: 'cork', name: 'Cork', category: 'Wood', color: '#c4a06a', roughness: 0.86, metalness: 0, tileSize: 0.5, pattern: { kind: 'noise', colors: ['#d2b07a', '#a8844e', '#e0c48e'] }, costPerM2: 36 },
  { id: 'tile-zellige-green', name: 'Green zellige', category: 'Tile', color: '#2f6d5d', roughness: 0.34, metalness: 0, tileSize: 0.4, pattern: { kind: 'hex', colors: ['#3d7d6a', '#24584c', '#4e9480'], grout: '#e6dcc8' }, costPerM2: 78 },
  { id: 'tile-checker', name: 'Checker tile', category: 'Tile', color: '#e7e2d8', roughness: 0.32, metalness: 0, tileSize: 0.5, pattern: { kind: 'checker', colors: ['#f4f0e8', '#2a2c2e'], grout: '#cfc6b8' }, costPerM2: 42 },
  { id: 'slate-dark', name: 'Dark slate', category: 'Stone', color: '#3c403f', roughness: 0.72, metalness: 0.04, tileSize: 0.8, pattern: { kind: 'tiles', colors: ['#4a4f4d', '#2e3331'], grout: '#1c1f1e' }, costPerM2: 74 },
  { id: 'travertine', name: 'Travertine', category: 'Stone', color: '#e4d5bc', roughness: 0.45, metalness: 0.02, tileSize: 1.1, pattern: { kind: 'marble', colors: ['#efe4d0', '#c4b496'] }, costPerM2: 96 },
  { id: 'rattan', name: 'Rattan', category: 'Fabric', color: '#c7a56b', roughness: 0.8, metalness: 0, tileSize: 0.25, pattern: { kind: 'weave', colors: ['#d4b57e', '#a8884e'] }, costPerM2: 40 },
  { id: 'boucle', name: 'Boucle', category: 'Fabric', color: '#e6dcc8', roughness: 1, metalness: 0, tileSize: 0.3, pattern: { kind: 'noise', colors: ['#f0e6d4', '#d5c8b0', '#cbbba0'] }, costPerM2: 52 },
  { id: 'velvet-rust', name: 'Rust velvet', category: 'Fabric', color: '#8c4636', roughness: 0.82, metalness: 0, tileSize: 0.35, pattern: { kind: 'fabric', colors: ['#a25540', '#6e3428'] }, costPerM2: 50 },
  { id: 'leather-black', name: 'Black leather', category: 'Fabric', color: '#1c1d1f', roughness: 0.48, metalness: 0.06, tileSize: 0.5, pattern: { kind: 'noise', colors: ['#2a2c2e', '#121314'] }, costPerM2: 64 },
  { id: 'chrome', name: 'Chrome', category: 'Metal', color: '#d5d8dc', roughness: 0.08, metalness: 1, tileSize: 0.5, pattern: { kind: 'none' }, costPerM2: 60 },
  { id: 'copper', name: 'Copper', category: 'Metal', color: '#b8734a', roughness: 0.32, metalness: 0.92, tileSize: 0.4, pattern: { kind: 'noise', colors: ['#c98458', '#8d542f'] }, costPerM2: 58 },
  { id: 'frosted-glass', name: 'Frosted glass', category: 'Glass', color: '#e7eef0', roughness: 0.62, metalness: 0, tileSize: 0.8, pattern: { kind: 'noise', colors: ['#f4f7f8', '#d5e0e4'] } },
  { id: 'mirror', name: 'Mirror', category: 'Glass', color: '#d8dee4', roughness: 0.02, metalness: 1, tileSize: 1, pattern: { kind: 'none' } },
  // Scanned sets (content pack). `tileSize` is the scan's real tile; the pattern is only the
  // fallback drawn when no pack is installed.
  { id: 'terrazzo-cream', name: 'Cream terrazzo', category: 'Tile', color: '#e5dccd', roughness: 0.3, metalness: 0, tileSize: 1, pattern: { kind: 'terrazzo', colors: ['#ebe3d5', '#b9a58a', '#8d8274', '#f4efe6'] }, costPerM2: 95 },
  { id: 'terrazzo-grey', name: 'Grey terrazzo', category: 'Tile', color: '#b9b6b0', roughness: 0.3, metalness: 0, tileSize: 1, pattern: { kind: 'terrazzo', colors: ['#c1beb8', '#7d7a75', '#e4e1db', '#55524e'] }, costPerM2: 92 },
  { id: 'microcement', name: 'Microcement', category: 'Masonry', color: '#bdb8af', roughness: 0.5, metalness: 0, tileSize: 1.4, pattern: { kind: 'noise', colors: ['#c6c1b8', '#aea99f'] }, costPerM2: 65 },
  { id: 'microcement-dark', name: 'Dark microcement', category: 'Masonry', color: '#6e6c69', roughness: 0.5, metalness: 0, tileSize: 1.4, pattern: { kind: 'noise', colors: ['#7a7875', '#5e5c59'] }, costPerM2: 68 },
  { id: 'stacked-stone-cladding', name: 'Stacked stone cladding', category: 'Stone', color: '#9a9189', roughness: 0.88, metalness: 0, tileSize: 2, pattern: { kind: 'bricks', colors: ['#a59c93', '#857c74', '#b3aaa0'], grout: '#5f5852' }, costPerM2: 85 },
  { id: 'oak-wide-plank', name: 'Wide plank oak', category: 'Wood', color: '#bf9d6e', roughness: 0.6, metalness: 0, tileSize: 1.98, pattern: { kind: 'planks', colors: ['#c9a87a', '#b08e60', '#c19f70'] }, costPerM2: 78 },
  { id: 'oak-whitewashed', name: 'Whitewashed oak', category: 'Wood', color: '#d8cfc0', roughness: 0.65, metalness: 0, tileSize: 1.8, pattern: { kind: 'planks', colors: ['#e0d8ca', '#cbc1b0', '#d6ccbc'] }, costPerM2: 70 },
  { id: 'oak-grey', name: 'Grey oak', category: 'Wood', color: '#9a948a', roughness: 0.65, metalness: 0, tileSize: 1.5, pattern: { kind: 'planks', colors: ['#a49e94', '#8a847a', '#97918a'] }, costPerM2: 66 },
  { id: 'oak-veneer', name: 'Oak veneer', category: 'Wood', color: '#c9a97a', roughness: 0.5, metalness: 0, tileSize: 1.83, pattern: { kind: 'planks', colors: ['#d2b386', '#bd9c6c'] }, costPerM2: 45 },
  { id: 'walnut-veneer', name: 'Walnut veneer', category: 'Wood', color: '#5a3d2b', roughness: 0.5, metalness: 0, tileSize: 1, pattern: { kind: 'planks', colors: ['#654532', '#4c3324'] }, costPerM2: 58 },
  { id: 'encaustic-tile', name: 'Azulejo tile', category: 'Tile', color: '#d9d2c4', roughness: 0.4, metalness: 0, tileSize: 1, pattern: { kind: 'tiles', colors: ['#e3dccf', '#cbc2b2'], grout: '#b8ae9e' }, costPerM2: 88 },
  { id: 'zellige-white', name: 'White zellige', category: 'Tile', color: '#f1eee8', roughness: 0.25, metalness: 0, tileSize: 0.8, pattern: { kind: 'tiles', colors: ['#f6f3ee', '#e6e2da'], grout: '#d3cdc2' }, costPerM2: 80 },
  { id: 'porcelain-large-grey', name: 'Large-format porcelain', category: 'Tile', color: '#a8a6a1', roughness: 0.3, metalness: 0, tileSize: 3, pattern: { kind: 'tiles', colors: ['#b0aea9', '#a09e99'], grout: '#8a8884' }, costPerM2: 58 },
  { id: 'porcelain-large-sand', name: 'Sand porcelain slab', category: 'Tile', color: '#cfc5b4', roughness: 0.3, metalness: 0, tileSize: 3, pattern: { kind: 'tiles', colors: ['#d6ccbb', '#c6bcab'], grout: '#ada393' }, costPerM2: 60 },
  { id: 'tile-hex-black', name: 'Black hex tile', category: 'Tile', color: '#2b2d2f', roughness: 0.3, metalness: 0, tileSize: 0.45, pattern: { kind: 'hex', colors: ['#323436'], grout: '#9a9690' }, costPerM2: 66 },
  { id: 'tile-subway-white', name: 'White subway tile', category: 'Tile', color: '#f4f3ef', roughness: 0.2, metalness: 0, tileSize: 0.6, pattern: { kind: 'bricks', colors: ['#f8f7f3', '#eeede9'], grout: '#cfcbc4' }, costPerM2: 38 },
  { id: 'tile-subway-blue', name: 'Blue subway tile', category: 'Tile', color: '#2f4f66', roughness: 0.2, metalness: 0, tileSize: 0.6, pattern: { kind: 'bricks', colors: ['#365a73', '#284558'], grout: '#d5d2cb' }, costPerM2: 46 },
  { id: 'tile-penny-round', name: 'Penny round tile', category: 'Tile', color: '#e8e4dc', roughness: 0.3, metalness: 0, tileSize: 0.4, pattern: { kind: 'hex', colors: ['#efebe4'], grout: '#bdb6aa' }, costPerM2: 72 },
  { id: 'terracotta-floor-tile', name: 'Terracotta tile', category: 'Tile', color: '#b8603f', roughness: 0.7, metalness: 0, tileSize: 2.08, pattern: { kind: 'tiles', colors: ['#c2694a', '#a85536'], grout: '#8c6a58' }, costPerM2: 44 },
  { id: 'rug-wool', name: 'Wool rug', category: 'Fabric', color: '#d9cfbd', roughness: 1, metalness: 0, tileSize: 1.7, pattern: { kind: 'fabric', colors: ['#e0d7c6', '#cbc0ac'] }, costPerM2: 60 },
  { id: 'rug-jute', name: 'Jute rug', category: 'Fabric', color: '#b89d6e', roughness: 1, metalness: 0, tileSize: 0.27, pattern: { kind: 'weave', colors: ['#c4aa7a', '#a68b5e'] }, costPerM2: 34 },
  { id: 'leather-tan', name: 'Tan leather', category: 'Fabric', color: '#a87848', roughness: 0.5, metalness: 0.04, tileSize: 0.45, pattern: { kind: 'noise', colors: ['#b48354', '#966a3e'] }, costPerM2: 62 },
  { id: 'leather-cream', name: 'Cream leather', category: 'Fabric', color: '#e2d8c6', roughness: 0.5, metalness: 0.03, tileSize: 0.3, pattern: { kind: 'noise', colors: ['#e9e0cf', '#d4c9b5'] }, costPerM2: 66 },
  { id: 'cane-webbing', name: 'Cane webbing', category: 'Fabric', color: '#d2b57e', roughness: 0.75, metalness: 0, tileSize: 0.25, pattern: { kind: 'weave', colors: ['#dcc08a', '#b89a62'] }, costPerM2: 48 },
  { id: 'brass-brushed', name: 'Brushed brass', category: 'Metal', color: '#bf9d58', roughness: 0.4, metalness: 0.95, tileSize: 0.5, pattern: { kind: 'noise', colors: ['#c9a862', '#ad8c4a'] }, costPerM2: 70 },
  { id: 'steel-black', name: 'Black steel', category: 'Metal', color: '#25272a', roughness: 0.45, metalness: 0.8, tileSize: 1, pattern: { kind: 'noise', colors: ['#2e3033', '#1c1e20'] }, costPerM2: 48 },
  { id: 'steel-brushed', name: 'Brushed steel', category: 'Metal', color: '#a9adb0', roughness: 0.4, metalness: 0.95, tileSize: 0.6, pattern: { kind: 'noise', colors: ['#b2b6b9', '#9a9ea1'] }, costPerM2: 56 },
  { id: 'aluminium-brushed', name: 'Brushed aluminium', category: 'Metal', color: '#c2c5c8', roughness: 0.38, metalness: 0.95, tileSize: 0.6, pattern: { kind: 'noise', colors: ['#cacdd0', '#b4b7ba'] }, costPerM2: 52 },
  { id: 'corten-steel', name: 'Corten steel', category: 'Metal', color: '#7a3f26', roughness: 0.75, metalness: 0.6, tileSize: 1, pattern: { kind: 'noise', colors: ['#87482c', '#6a361f', '#93522f'] }, costPerM2: 74 },
  { id: 'zinc-roof', name: 'Zinc roof', category: 'Roof', color: '#7f8685', roughness: 0.4, metalness: 0.8, tileSize: 0.8, pattern: { kind: 'planks', colors: ['#878e8d', '#737a79'] }, costPerM2: 62 },
  { id: 'quartz-worktop', name: 'Quartz worktop', category: 'Stone', color: '#ecebe8', roughness: 0.15, metalness: 0, tileSize: 1.4, pattern: { kind: 'terrazzo', colors: ['#f0efec', '#d9d7d2', '#c4c2bd'] }, costPerM2: 260 },
  { id: 'marble-calacatta', name: 'Calacatta marble', category: 'Stone', color: '#f5f3ef', roughness: 0.15, metalness: 0.03, tileSize: 1.4, pattern: { kind: 'marble', colors: ['#f8f6f2', '#b8afa2'] }, costPerM2: 320 },
  { id: 'marble-nero', name: 'Nero marble', category: 'Stone', color: '#1f2022', roughness: 0.15, metalness: 0.03, tileSize: 1.4, pattern: { kind: 'marble', colors: ['#25262a', '#d8d6d0'] }, costPerM2: 290 },
  { id: 'granite-worktop', name: 'Granite worktop', category: 'Stone', color: '#4a4a4c', roughness: 0.25, metalness: 0.02, tileSize: 1, pattern: { kind: 'terrazzo', colors: ['#525254', '#2e2e30', '#8a8886', '#6a6a6c'] }, costPerM2: 210 },
  { id: 'limestone-paving', name: 'Limestone paving', category: 'Stone', color: '#d6cbb5', roughness: 0.7, metalness: 0, tileSize: 2, pattern: { kind: 'tiles', colors: ['#ddd2bd', '#cbbfa8'], grout: '#ada28c' }, costPerM2: 75 },
  { id: 'cobblestone', name: 'Cobblestone', category: 'Ground', color: '#8f8a84', roughness: 0.9, metalness: 0, tileSize: 1, pattern: { kind: 'tiles', colors: ['#9a958f', '#827d77', '#a5a09a'], grout: '#5c5853' }, costPerM2: 70 },
  { id: 'brick-paving-herringbone', name: 'Brick herringbone paving', category: 'Ground', color: '#9a6652', roughness: 0.88, metalness: 0, tileSize: 1.8, pattern: { kind: 'herringbone', colors: ['#a56e58', '#8a5a47'] }, costPerM2: 62 },
  { id: 'patio-paving', name: 'Patio paving', category: 'Ground', color: '#a8a49c', roughness: 0.85, metalness: 0, tileSize: 2.15, pattern: { kind: 'tiles', colors: ['#b0aca4', '#9c9890'], grout: '#7d7a73' }, costPerM2: 48 },
  { id: 'decking', name: 'Timber decking', category: 'Wood', color: '#8a6a4a', roughness: 0.75, metalness: 0, tileSize: 2.4, pattern: { kind: 'planks', colors: ['#957454', '#7c5e40', '#8e6e4d'] }, costPerM2: 64 },
  { id: 'gravel-grey', name: 'Grey gravel', category: 'Ground', color: '#8e8b86', roughness: 0.98, metalness: 0, tileSize: 1.5, pattern: { kind: 'terrazzo', colors: ['#9a9792', '#77746f', '#aaa7a2', '#62605c'] }, costPerM2: 14 },
  { id: 'bark-mulch', name: 'Bark mulch', category: 'Ground', color: '#5c3f2a', roughness: 1, metalness: 0, tileSize: 2, pattern: { kind: 'noise', colors: ['#694a33', '#4a3221', '#7a573c'] }, costPerM2: 9 },
  { id: 'render-stucco', name: 'White render', category: 'Plaster', color: '#e6e2da', roughness: 0.9, metalness: 0, tileSize: 2, pattern: { kind: 'noise', colors: ['#ebe7df', '#d8d4cc'] }, costPerM2: 26 },
  { id: 'lime-plaster', name: 'Lime plaster', category: 'Plaster', color: '#d9cfbf', roughness: 0.95, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#e0d7c8', '#c9bfae'] }, costPerM2: 30 },
  { id: 'timber-cladding-vertical', name: 'Timber siding', category: 'Wood', color: '#9c7650', roughness: 0.7, metalness: 0, tileSize: 1, pattern: { kind: 'planks', colors: ['#a7805a', '#8c6845', '#a07a54'] }, costPerM2: 56 },
  { id: 'slate-roof', name: 'Slate roof', category: 'Roof', color: '#4b5052', roughness: 0.7, metalness: 0.03, tileSize: 1.5, pattern: { kind: 'courses', colors: ['#54595b', '#404547'], grout: '#2a2e30' }, costPerM2: 78 },
  { id: 'clay-roof-terracotta', name: 'Terracotta roof', category: 'Roof', color: '#b0583a', roughness: 0.85, metalness: 0, tileSize: 2.6, pattern: { kind: 'courses', colors: ['#bb6040', '#9c4a30'], grout: '#66322a' }, costPerM2: 44 },
  { id: 'clay-roof-grey', name: 'Grey roof tile', category: 'Roof', color: '#5f6264', roughness: 0.8, metalness: 0, tileSize: 3, pattern: { kind: 'courses', colors: ['#686b6d', '#545759'], grout: '#38393b' }, costPerM2: 46 },
  { id: 'clay-roof-anthracite', name: 'Anthracite clay roof', category: 'Roof', color: '#3d4042', roughness: 0.8, metalness: 0, tileSize: 2.9, pattern: { kind: 'courses', colors: ['#45484a', '#333638'], grout: '#222426' }, costPerM2: 50 },
  { id: 'brick-yellow', name: 'Yellow stock brick', category: 'Masonry', color: '#c9a96a', roughness: 0.86, metalness: 0, tileSize: 2, pattern: { kind: 'bricks', colors: ['#d1b174', '#b8975a'], grout: '#d8cfbd' }, costPerM2: 52 },
  { id: 'brick-grey', name: 'Grey brick', category: 'Masonry', color: '#8a8985', roughness: 0.86, metalness: 0, tileSize: 1.05, pattern: { kind: 'bricks', colors: ['#93928e', '#7b7a76'], grout: '#bdbbb5' }, costPerM2: 50 },
  { id: 'lawn-fine', name: 'Fine lawn', category: 'Ground', color: '#6b8c4a', roughness: 0.95, metalness: 0, tileSize: 2.51, pattern: { kind: 'noise', colors: ['#7a9d56', '#5a773e'] } },
]

const byId = new Map(MATERIALS.map((m) => [m.id, m]))

export function getMaterialDef(id: string): MaterialDef | undefined {
  return byId.get(id)
}

/** Flat colour for the plan, the material picker and any canvas that has no WebGL. */
export function swatchColor(id: string): string {
  return byId.get(id)?.color ?? '#c8c2b8'
}

export const MATERIAL_CATEGORIES: string[] = [...new Set(MATERIALS.map((m) => m.category))]
