// The single source of truth for a Nestwright project. Pure data: JSON-serialisable,
// no class instances, no three.js. Everything the game shows is derived from this.
//
// Units: metres, radians. Plan coordinates (x, y) map to world (x, elevation, y), y-up.

export type Id = string;

export interface Vec2 {
  x: number;
  y: number;
}

export const PROJECT_VERSION = 1;

// ---------------------------------------------------------------- materials

/** Reference to a material in the library, optionally tinted. */
export interface MaterialRef {
  /** Library id, e.g. "plaster-white", "oak-planks", "slate-tile". */
  id: string;
  /** Optional hex tint "#rrggbb" multiplied over the base colour. */
  tint?: string;
  /** Texture scale multiplier (1 = library default). */
  scale?: number;
}

// ---------------------------------------------------------------- structure

export interface Wall {
  id: Id;
  a: Vec2;
  b: Vec2;
  thickness: number; // default 0.2
  height: number; // default = level.height
  /** Sagitta of the arc in metres; 0 = straight. Positive bows to the left of a→b. */
  bulge: number;
  /** Material of the side to the left of a→b. */
  left: MaterialRef;
  /** Material of the side to the right of a→b. */
  right: MaterialRef;
  /** Ivy coverage painted on the wall, 0..1 per side. */
  ivy?: { left: number; right: number };
  /** Low walls / railings for balconies. */
  kind?: 'wall' | 'railing' | 'half';
}

export type OpeningType =
  | 'door'
  | 'double-door'
  | 'sliding-door'
  | 'garage-door'
  | 'arch'
  | 'window'
  | 'fixed-window'
  | 'tall-window'
  | 'round-window'
  | 'corner-window';

export interface Opening {
  id: Id;
  wallId: Id;
  type: OpeningType;
  /** Distance from wall.a to the opening centre, along the wall, in metres. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number;
  /** Door swing: which side and hinge. */
  flipSide?: boolean;
  flipHinge?: boolean;
  frame: MaterialRef;
}

export type RoomType =
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'wc'
  | 'office'
  | 'hall'
  | 'storage'
  | 'laundry'
  | 'garage'
  | 'balcony'
  | 'terrace'
  | 'kids'
  | 'other';

/**
 * Rooms are detected from closed wall loops (see model/rooms.ts). The detected polygon is
 * recomputed; user-set properties are kept in `rooms` keyed by a stable `key` derived from
 * the sorted ids of the bounding walls.
 */
export interface RoomProps {
  key: string;
  name: string;
  type: RoomType;
  floor: MaterialRef;
  ceiling: MaterialRef;
  /** Hide the ceiling slab (e.g. double-height space or open courtyard). */
  noCeiling?: boolean;
}

export interface Room extends RoomProps {
  polygon: Vec2[]; // counter-clockwise
  area: number; // m²
  centroid: Vec2;
}

export type StairShape = 'straight' | 'l-shape' | 'u-shape' | 'spiral';

export interface Stair {
  id: Id;
  shape: StairShape;
  /** Bottom-centre of the first step. */
  position: Vec2;
  rotation: number;
  width: number;
  /** Rise to cover; defaults to the level height. */
  rise: number;
  /** For l/u shapes: turn direction. */
  turnLeft?: boolean;
  material: MaterialRef;
  railing: boolean;
}

export type RoofShape = 'flat' | 'shed' | 'gable' | 'hip' | 'mansard' | 'dome';

export interface Roof {
  id: Id;
  shape: RoofShape;
  /** Outline polygon in plan; by default the outer outline of the level's walls. */
  outline: Vec2[];
  pitch: number; // radians
  overhang: number; // metres
  /** Ridge direction for gable/shed: angle in plan. */
  ridgeAngle: number;
  thickness: number;
  material: MaterialRef;
  /** Polygonal holes for skylights/cut-outs, in plan coordinates. */
  cutouts: Vec2[][];
}

export interface Column {
  id: Id;
  position: Vec2;
  size: number;
  round: boolean;
  material: MaterialRef;
}

/** Free-floating slab: terraces, balconies, mezzanines, decks. */
export interface Slab {
  id: Id;
  polygon: Vec2[];
  thickness: number;
  /** Offset of the top surface above level elevation. */
  top: number;
  material: MaterialRef;
}

// ---------------------------------------------------------------- items

/**
 * A placed object: furniture, fixture, lamp, plant, imported model.
 * `catalogId` refers to a procedural catalog entry ("sofa-3", "bed-double") or
 * "import:<assetId>" for user-imported models stored in project.assets.
 */
export interface Item {
  id: Id;
  catalogId: string;
  position: Vec2;
  /** Height of the item's base above the level floor. */
  elevation: number;
  rotation: number;
  /** Target dimensions in metres (width x, depth y/z, height). */
  size: { w: number; d: number; h: number };
  /** Named material slots of the catalog entry → material. */
  materials: Record<string, MaterialRef>;
  /** Free parameters understood by the catalog entry (e.g. kitchen run config). */
  params: Record<string, number | string | boolean>;
  /** For lamps: on/off. */
  lightOn?: boolean;
  /** Price in the project's currency; defaults from catalog. */
  price?: number;
  locked?: boolean;
}

// ---------------------------------------------------------------- levels

export interface Level {
  id: Id;
  name: string;
  /** Floor elevation of this level above ground (0 for ground floor). */
  elevation: number;
  /** Floor-to-floor height. */
  height: number;
  /** Slab thickness under this level's floor. */
  slabThickness: number;
  walls: Wall[];
  openings: Opening[];
  /** User properties for detected rooms, keyed by RoomProps.key. */
  rooms: RoomProps[];
  stairs: Stair[];
  roofs: Roof[];
  columns: Column[];
  slabs: Slab[];
  items: Item[];
  /** Dimension lines drawn by the user. */
  dimensions: { id: Id; a: Vec2; b: Vec2; offset: number }[];
}

// ---------------------------------------------------------------- outside

export type GroundLayer =
  | 'lawn'
  | 'meadow'
  | 'gravel'
  | 'paving'
  | 'sand'
  | 'soil'
  | 'path'
  | 'forest-floor';

export const GROUND_LAYERS: GroundLayer[] = [
  'lawn',
  'meadow',
  'gravel',
  'paving',
  'sand',
  'soil',
  'path',
  'forest-floor',
];

export interface Terrain {
  enabled: boolean;
  /** Plot size in metres, centred on the origin. */
  width: number;
  depth: number;
  /** Heightmap resolution: samples per side = resolution + 1. */
  resolution: number;
  /** Row-major (resolution+1)² heights in metres. Stored as plain numbers for JSON. */
  heights: number[];
  /**
   * Row-major (resolution+1)² layer weights; each sample has GROUND_LAYERS.length weights.
   * Encoded as a base64 Uint8 string to keep project files small.
   */
  splat: string;
  /** Scattered vegetation instances. */
  plants: { id: Id; species: string; position: Vec2; scale: number; rotation: number }[];
  water: {
    id: Id;
    kind: 'pond' | 'pool' | 'stream';
    polygon: Vec2[];
    /** Water surface elevation in metres. */
    level: number;
    /** Basin depth below `level`. Omitted files keep the kind's default. */
    depth?: number;
  }[];
  fences: {
    id: Id;
    style: string;
    points: Vec2[];
    height: number;
    /** Segment indices (point i → i+1) that are gates. */
    gates?: number[];
  }[];
  /** Plot boundary polygon (visual + budget). */
  boundary: Vec2[];
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';

export interface Environment {
  /** Day of year 1..365. */
  dayOfYear: number;
  /** Hours 0..24. */
  time: number;
  latitude: number; // degrees
  /** Rotation of north in plan, radians. */
  north: number;
  weather: Weather;
  /** 0..1 */
  cloudiness: number;
  /** Interior lamps auto-on after sunset. */
  autoLights: boolean;
}

// ---------------------------------------------------------------- together

export interface Wish {
  id: Id;
  author: string;
  /** What it is attached to: an item id, a room key, or a free plan point. */
  target: { kind: 'item'; id: Id } | { kind: 'room'; key: string } | { kind: 'point'; levelId: Id; at: Vec2 };
  reaction: 'love' | 'no' | 'idea';
  note: string;
  createdAt: number;
  /** Set once the household has settled it. Omitted on older files. */
  resolved?: boolean;
}

export interface Variant {
  id: Id;
  name: string;
  createdAt: number;
  /** Snapshot of levels + terrain at the time it was saved. */
  levels: Level[];
  terrain: Terrain;
}

export interface Budget {
  currency: string; // "EUR"
  /** Construction cost per m² of floor area. */
  buildCostPerM2: number;
  /** Extra cost per m² by floor material id. */
  finishCostPerM2: Record<string, number>;
  /** Spending cap in `currency`. Omitted until someone sets one. */
  target?: number;
}

export interface RoomRequirement {
  id: Id;
  roomKey: string;
  /** Catalog id that must be present in the room, or a min area. */
  rule: { kind: 'has-item'; catalogId: string } | { kind: 'min-area'; area: number };
  text: string;
}

// ---------------------------------------------------------------- project

export interface ImportedAsset {
  id: Id;
  name: string;
  format: 'glb' | 'obj';
  /** base64 data. */
  data: string;
}

export interface TraceImage {
  levelId: Id;
  /** data URL of the image (PDF pages are rasterised on import). */
  src: string;
  /** Plan position of the image's top-left corner. */
  origin: Vec2;
  /** Metres per image pixel. */
  scale: number;
  rotation: number;
  opacity: number;
}

export type ProjectKind = 'house' | 'apartment';

export interface Project {
  version: number;
  id: Id;
  name: string;
  kind: ProjectKind;
  createdAt: number;
  updatedAt: number;
  levels: Level[];
  terrain: Terrain;
  environment: Environment;
  assets: ImportedAsset[];
  traces: TraceImage[];
  wishes: Wish[];
  variants: Variant[];
  budget: Budget;
  requirements: RoomRequirement[];
  units: 'metric' | 'imperial';
}
