// src/config/TileDefinitions.ts
//
// Static metadata for tile faces. Only 1R retains its hardcoded definition;
// all other tiles use empty defaults and rely on user-generated edits
// saved to the server via the Tile Definition Editor.
//
// Coordinate system (at rotation 0):
//   localX: 0=left, 1=center, 2=right
//   localY: 0=top, 1=middle, 2=bottom
//
// Edge localIndex:
//   north/south: 0=left, 1=center, 2=right
//   east/west:   0=top, 1=middle, 2=bottom

import {
  TileDefinition,
  TileCellDef,
  TileEdgeDef,
  TileInternalEdge,
  EdgeSide,
} from '../types/TileDefinition';
import { expand3x3to9x9 } from './tileDefExpander';
import { TILE_CELLS_PER_SIDE } from './Layout';

// --- Helper builders ---

export function cell(localX: number, localY: number, type: 'street' | 'building', roomId?: string): TileCellDef {
  return { localX, localY, type, ...(roomId ? { roomId } : {}) };
}

export function edge(side: EdgeSide, localIndex: number, type: 'street' | 'wall', crosswalk = false): TileEdgeDef {
  return { side, localIndex, type, crosswalk };
}

export function crosswalk(fromX: number, fromY: number, toX: number, toY: number): TileInternalEdge {
  return { fromX, fromY, toX, toY, type: 'crosswalk' };
}

// ========================================================================
// TILE DEFINITIONS
// ========================================================================

/**
 * 1R: L-street along west + south edges
 * Building: 2x2 block in NE
 *   Room A: (1,0)+(1,1) - large dark room
 *   Room B: (2,0)+(2,1) - green/storage room
 *
 * Layout:
 *   S  A  B
 *   S  A  B
 *   S  S  S
 */
const tile1R: TileDefinition = {
  id: '1R',
  cells: [
    cell(0, 0, 'street'), cell(1, 0, 'building', 'A'), cell(2, 0, 'building', 'B'),
    cell(0, 1, 'street'), cell(1, 1, 'building', 'A'), cell(2, 1, 'building', 'B'),
    cell(0, 2, 'street'), cell(1, 2, 'street'),         cell(2, 2, 'street'),
  ],
  edges: [
    // North
    edge('north', 0, 'street'), edge('north', 1, 'wall'), edge('north', 2, 'wall'),
    // South — external edges never carry crosswalk (crosswalks are internal only)
    edge('south', 0, 'street'), edge('south', 1, 'street'), edge('south', 2, 'street'),
    // West
    edge('west', 0, 'street'), edge('west', 1, 'street'), edge('west', 2, 'street'),
    // East
    edge('east', 0, 'wall'), edge('east', 1, 'wall'), edge('east', 2, 'street'),
  ],
  internalEdges: [
    crosswalk(0, 1, 0, 2), // Crosswalk at L-bend (vertical)
    crosswalk(0, 2, 1, 2), // Crosswalk at L-bend (horizontal)
  ],
};

// All other tile definitions (1V-9V, 2R-9R) removed — they were inaccurate
// legacy data from early visual inspection. The system relies on user-generated
// tile edits saved to the server via the Tile Definition Editor.

/** Create an empty (all-street) default tile definition for tiles without hardcoded defs. */
function createEmptyDef(tileId: string): TileDefinition {
  const cells: TileCellDef[] = [];
  const edges: TileEdgeDef[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      cells.push({ localX: x, localY: y, type: 'street' });
    }
  }
  const sides: EdgeSide[] = ['north', 'south', 'east', 'west'];
  for (const side of sides) {
    for (let i = 0; i < 3; i++) {
      edges.push({ side, localIndex: i, type: 'street', crosswalk: false });
    }
  }
  return { id: tileId, cells, edges, internalEdges: [] };
}

// ========================================================================
// REGISTRY
// ========================================================================

// Raw 3x3 definitions — auto-expanded to 30x30 at module load
const _rawDefs: Record<string, TileDefinition> = {
  '1R': tile1R,
};

// Generate empty defs for all tile IDs that exist in the spritesheet
const ALL_TILE_IDS = ['1V','2R','2V','3R','3V','4R','4V','5R','5V','6R','6V','7R','7V','8R','8V','9R','9V'];
for (const id of ALL_TILE_IDS) {
  if (!_rawDefs[id]) _rawDefs[id] = createEmptyDef(id);
}

const _registry: Record<string, TileDefinition> = {};
for (const [id, def] of Object.entries(_rawDefs)) {
  _registry[id] = expand3x3to9x9(def);
}

/**
 * Live registry of all tile definitions. Mutated by registerTileDefinitions().
 * Do NOT cache this reference — always use getTileDefinition(id) for lookups.
 */
export const TILE_DEFINITIONS: Record<string, TileDefinition> = _registry;

export function getTileDefinition(tileId: string): TileDefinition | undefined {
  return _registry[tileId];
}

/**
 * Register new tile definitions (e.g. from an expansion tile pack).
 *
 * To add a new tile pack:
 * 1. Add the tile spritesheet image to public/images/tiles/
 * 2. Update TileService to load and slice the new spritesheet
 * 3. Create TileDefinition entries for each tile face
 * 4. Call registerTileDefinitions() with the new definitions
 *
 * Each TileDefinition needs:
 *   - cells: 900 entries (30x30 grid) marking each sub-cell as 'street' or 'building'
 *            with optional roomId to group building cells into rooms
 *   - edges: 120 entries (30 per side) marking each external edge as 'street'
 *            or 'wall' — external edges never carry crosswalk
 *   - internalEdges: crosswalk/wall markers between adjacent cells within the tile
 *
 * Legacy 3x3 definitions are auto-expanded to 30x30 via tileDefExpander.
 */
export function registerTileDefinitions(defs: TileDefinition[]): void {
  for (const def of defs) {
    _registry[def.id] = (def.gridSize !== TILE_CELLS_PER_SIDE) ? expand3x3to9x9(def) : def;
  }
}

/**
 * Load tile definitions from the server and register them,
 * overriding hardcoded defaults. Called once at app startup.
 * Runs repairExternalEdges() on each loaded def to fix stale edge data.
 */
export async function loadTileDefinitionsFromServer(): Promise<void> {
  try {
    const res = await fetch('/api/tile-definitions');
    if (!res.ok) return;
    const defs: TileDefinition[] = await res.json();
    if (defs.length > 0) {
      // Lazy import to avoid circular dependency (TileDefinitionService imports TILE_DEFINITIONS)
      const { repairExternalEdges } = await import('../services/TileDefinitionService');
      for (const def of defs) {
        repairExternalEdges(def);
      }
      registerTileDefinitions(defs);
      console.log(`Loaded ${defs.length} tile definitions from server (edges repaired)`);
    }
  } catch (e) {
    console.warn('Failed to load tile definitions from server, using defaults', e);
  }
}
