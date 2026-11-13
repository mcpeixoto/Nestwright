/** Procedural material library. Colour is the flat fallback; `pattern` is drawn on a canvas. */

export type PatternKind =
  | 'none'
  | 'noise'
  | 'planks'
  | 'herringbone'
  | 'bricks'
  | 'tiles'
  | 'hex'
  | 'terrazzo'
  | 'marble'
  | 'fabric'

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
  { id: 'plaster-white', name: 'White plaster', category: 'Plaster', color: '#f4f1ea', roughness: 0.92, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#f7f4ee', '#e7e1d6'] }, costPerM2: 18 },
  { id: 'plaster-warm', name: 'Warm plaster', category: 'Plaster', color: '#efe2d0', roughness: 0.9, metalness: 0, tileSize: 1.5, pattern: { kind: 'noise', colors: ['#f3e6d4', '#e2d0b8'] }, costPerM2: 18 },
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
  { id: 'fabric-velvet-green', name: 'Green velvet', category: 'Fabric', color: '#2f5d52', roughness: 0.85, metalness: 0, tileSize: 0.35, pattern: { kind: 'fabric', colors: ['#3a6d60', '#244840'] }, costPerM2: 48 },
  { id: 'leather-brown', name: 'Brown leather', category: 'Fabric', color: '#6a432c', roughness: 0.55, metalness: 0.05, tileSize: 0.6, pattern: { kind: 'noise', colors: ['#7a4e34', '#5a3824'] }, costPerM2: 60 },
  { id: 'metal-black', name: 'Blackened metal', category: 'Metal', color: '#2a2c2e', roughness: 0.35, metalness: 0.85, tileSize: 1, pattern: { kind: 'noise', colors: ['#34373a', '#1e2022'] }, costPerM2: 40 },
  { id: 'metal-brass', name: 'Brass', category: 'Metal', color: '#c6a15a', roughness: 0.28, metalness: 0.9, tileSize: 0.5, pattern: { kind: 'none' }, costPerM2: 55 },
  { id: 'glass', name: 'Glass', category: 'Glass', color: '#d5e4ea', roughness: 0.05, metalness: 0, tileSize: 1, pattern: { kind: 'none' } },
  { id: 'grass', name: 'Lawn', category: 'Ground', color: '#6f8f4e', roughness: 0.95, metalness: 0, tileSize: 1.2, pattern: { kind: 'noise', colors: ['#7ea258', '#5d7a40'] } },
  { id: 'gravel', name: 'Gravel', category: 'Ground', color: '#b5aa9c', roughness: 0.98, metalness: 0, tileSize: 0.6, pattern: { kind: 'terrazzo', colors: ['#cfc4b4', '#a89884', '#8d8274', '#ddd4c6'] } },
  { id: 'roof-tiles', name: 'Roof tiles', category: 'Roof', color: '#8e4638', roughness: 0.8, metalness: 0, tileSize: 0.7, pattern: { kind: 'tiles', colors: ['#9a5142', '#7a3b30'], grout: '#5c2e26' }, costPerM2: 42 },
  { id: 'roof-metal', name: 'Standing seam', category: 'Roof', color: '#8d9290', roughness: 0.32, metalness: 0.7, tileSize: 0.8, pattern: { kind: 'planks', colors: ['#9aa09d', '#7e8482'] }, costPerM2: 38 },
  { id: 'wood-cladding', name: 'Wood cladding', category: 'Wood', color: '#b08968', roughness: 0.7, metalness: 0, tileSize: 1, pattern: { kind: 'planks', colors: ['#c29a74', '#9a7450', '#d0ae86'] }, costPerM2: 50 },
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
