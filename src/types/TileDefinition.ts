// src/types/TileDefinition.ts
//
// Tile definition metadata. Each tile face has a definition describing
// its 30x30 sub-cell grid (15px per cell): which cells are buildings
// vs streets, room groupings, wall/crosswalk boundaries, and edge
// connectivity. Legacy 3x3 definitions are auto-expanded on load.

export interface TileCellDef {
  localX: number; // 0-29 within tile (column)
  localY: number; // 0-29 within tile (row)
  type: 'street' | 'building';
  roomId?: string; // Groups cells into rooms within this tile (e.g., "A", "B", ... "Z")
}

export type EdgeSide = 'north' | 'south' | 'east' | 'west';

export interface TileEdgeDef {
  side: EdgeSide;
  localIndex: number; // 0-29 along that edge (left-to-right for N/S, top-to-bottom for E/W)
  type: 'street' | 'wall';
  crosswalk: boolean; // If true, acts as a zone divider on street edges
  doorway?: boolean;  // If true, marks a room-to-room open passage (no door) on tile boundary
}

export type InternalEdgeType = 'open' | 'wall' | 'crosswalk' | 'doorway';

export interface TileInternalEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: InternalEdgeType;
}

export interface RoomProperties {
  isDark: boolean;
  displayName?: string; // Optional human-readable name for the room
}

/** A door on an edge between two adjacent sub-cells within a tile */
export interface TileDoorDef {
  x1: number; y1: number;
  x2: number; y2: number;
}

export type BoundaryEdgeType = 'open' | 'wall' | 'crosswalk' | 'doorway';

export interface TileDefinition {
  id: string; // "1V", "2R", etc.
  gridSize?: number; // absent or 3 = legacy 3x3, 30 = current 30x30
  cells: TileCellDef[];
  edges: TileEdgeDef[];
  internalEdges: TileInternalEdge[];
  doors?: TileDoorDef[]; // Door positions on cell edges (rotate with tile)
  boundaryTypes?: Record<string, BoundaryEdgeType>; // keyed by room-pair "A|S1"
  roomProperties?: Record<string, RoomProperties>; // keyed by roomId ("A"-"Z", "S1"-"S9")
}
