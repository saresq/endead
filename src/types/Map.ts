
// src/types/Map.ts

export type TileId = string; // e.g. "1V", "2R"

export interface TileInstance {
  id: string; // unique ID in layout
  tileId: TileId; // Reference to source image (1V, 1R, etc)
  x: number; // Logical Grid X (in Units of 3x3 Zones)
  y: number; // Logical Grid Y
  rotation: 0 | 90 | 180 | 270;
}

// --- Scenario Map: Authored map with full game mechanics ---

/** Zone-level cell coordinate key: "x,y" in zone grid (not tile grid) */
export type ZoneCellKey = string; // e.g. "3,5"

/** Marker types that can be placed on zone cells */
export enum MarkerType {
  PlayerStart = 'PLAYER_START',
  ZombieSpawn = 'ZOMBIE_SPAWN',                 // default = always-on
  ZombieSpawnBlue = 'ZOMBIE_SPAWN_BLUE',        // dormant until blue Objective taken
  ZombieSpawnGreen = 'ZOMBIE_SPAWN_GREEN',      // dormant until green Objective taken
  Exit = 'EXIT',
  Objective = 'OBJECTIVE',                      // yellow common Objective token
  ObjectiveBlue = 'OBJECTIVE_BLUE',             // blue Objective token (activates blue spawns)
  ObjectiveGreen = 'OBJECTIVE_GREEN',           // green Objective token (activates green spawns)
  EpicCrate = 'EPIC_CRATE',                     // red Epic Weapon Crate token
}

/** A marker placed on a specific zone cell */
export interface MapMarker {
  type: MarkerType;
  x: number; // Zone grid X
  y: number; // Zone grid Y
}

/** A crosswalk override on an edge between two adjacent zone cells */
export interface CrosswalkOverride {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hasCrosswalk: boolean; // true = force crosswalk, false = remove crosswalk
}

/** Configurable, AND-composed win condition selected by the mapper. */
export type WinConditionConfig =
  | { type: 'REACH_EXIT' }
  | { type: 'TAKE_OBJECTIVE'; amount: number }
  | { type: 'TAKE_COLOR_OBJECTIVE'; color: 'BLUE' | 'GREEN'; amount: number }
  | { type: 'TAKE_EPIC_CRATE'; amount: number }
  | { type: 'KILL_ZOMBIE'; zombieType: 'ANY' | 'WALKER' | 'RUNNER' | 'BRUTE' | 'ABOMINATION'; amount: number }
  | { type: 'COLLECT_ITEMS'; items: { equipmentId: string; quantity: number }[] }
  | { type: 'REACH_DANGER_LEVEL'; threshold: 'YELLOW' | 'ORANGE' | 'RED' };

/** The full authored scenario map */
export interface ScenarioMap {
  id: string;
  name: string;
  width: number;  // In tiles (not zones)
  height: number;
  gridSize?: number; // absent or 3 = legacy 3x3 cell coords, 30 = current 30x30
  /**
   * Schema version. Phase A: optional (absent = legacy v1; importer migration
   * UX in Phase F handles it). After Phase F it becomes required `2` and the
   * loader rejects anything else.
   */
  schemaVersion?: 2;
  tiles: TileInstance[];

  // --- Authored game logic ---
  markers: MapMarker[];  // All placed markers (spawns, exits, objectives, player starts)

  /**
   * AND-composed win conditions. At save time (Phase E onwards) the editor
   * enforces `winConditions.length >= 1`. Optional here so legacy v1 maps and
   * partially-migrated test fixtures still type-check; ScenarioCompiler
   * defaults absent/empty to ReachExit + TakeObjective for back-compat.
   */
  winConditions?: WinConditionConfig[];

  // --- Crosswalk overrides ---
  crosswalkOverrides?: CrosswalkOverride[];  // Override crosswalk edges from tile definitions
}

// --- Constants ---

export const TILE_SOURCE = {
  width: 4247,
  height: 2138,
  cols: 6,
  rows: 3,
  padding: 28,
  tileOuterSize: 679,
  tileSize: 675
};
