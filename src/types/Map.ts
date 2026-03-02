
// src/types/Map.ts

export type TileId = string; // e.g. "1V", "2R"

export interface TileInstance {
  id: string; // unique ID in layout
  tileId: TileId; // Reference to source image (1V, 1R, etc)
  x: number; // Logical Grid X (in Units of 3x3 Zones)
  y: number; // Logical Grid Y
  rotation: 0 | 90 | 180 | 270;
}

// --- Scenario Map V2: Authored map with full game mechanics ---

/** Zone-level cell coordinate key: "x,y" in zone grid (not tile grid) */
export type ZoneCellKey = string; // e.g. "3,5"

/** Marker types that can be placed on zone cells */
export enum MarkerType {
  PlayerStart = 'PLAYER_START',
  ZombieSpawn = 'ZOMBIE_SPAWN',
  Exit = 'EXIT',
  Objective = 'OBJECTIVE',
}

/** A marker placed on a specific zone cell */
export interface MapMarker {
  type: MarkerType;
  x: number; // Zone grid X
  y: number; // Zone grid Y
}

/**
 * A door placed on an edge between two adjacent zone cells.
 * Convention: edges are stored as "x1,y1|x2,y2" where (x1,y1) < (x2,y2) lexicographically.
 * The cells must be cardinal neighbors.
 */
export interface MapDoor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  open: boolean; // Initial state: true = starts open, false = starts closed
}

/**
 * A room is a named group of zone cells that forms a building interior.
 * All cells in a room are treated as isBuilding=true, searchable=true.
 * Internal connections within a room are open passages (no doors unless explicitly placed).
 */
export interface MapRoom {
  id: string;       // e.g. "room-0"
  name: string;     // e.g. "Police Station", "Kitchen"
  cells: { x: number; y: number }[]; // Zone cells belonging to this room
}

/** The full authored scenario map */
export interface ScenarioMap {
  id: string;
  name: string;
  width: number;  // In tiles (not zones)
  height: number;
  tiles: TileInstance[];

  // --- Authored game logic ---
  rooms: MapRoom[];      // Building rooms (cells not in any room are streets)
  doors: MapDoor[];      // Doors on edges between cells
  markers: MapMarker[];  // All placed markers (spawns, exits, objectives, player starts)
}

// --- Legacy compat: old map format detection ---
export interface LegacyScenarioMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: TileInstance[];
  zones: any;
  spawns: any[];
  exits: any[];
}

export function isLegacyMap(map: any): map is LegacyScenarioMap {
  return map && !map.rooms && !map.markers;
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
