// src/config/tileDefExpander.ts
//
// Expands legacy 3x3 tile definitions to the 30x30 sub-cell format.
// Kept separate from TileDefinitionService to avoid circular imports.

import {
  TileDefinition,
  TileCellDef,
  TileEdgeDef,
  TileInternalEdge,
} from '../types/TileDefinition';
import { TILE_CELLS_PER_SIDE } from './Layout';

/** Scale factor from old 3x3 grid to current grid */
const SCALE = TILE_CELLS_PER_SIDE / 3; // 10

/**
 * Expand a legacy 3x3 tile definition to the current grid size.
 * Each old cell at (x,y) maps to SCALE×SCALE sub-cells.
 * Each old edge at localIndex i maps to SCALE sub-edges.
 * Already-current definitions are returned as-is.
 */
export function expand3x3to9x9(def: TileDefinition): TileDefinition {
  if (def.gridSize === TILE_CELLS_PER_SIDE) return def;

  const cells: TileCellDef[] = [];
  for (const c of def.cells) {
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        cells.push({
          localX: c.localX * SCALE + dx,
          localY: c.localY * SCALE + dy,
          type: c.type,
          roomId: c.roomId || (c.type === 'street' ? 'S1' : undefined),
        });
      }
    }
  }

  const edges: TileEdgeDef[] = [];
  for (const e of def.edges) {
    for (let d = 0; d < SCALE; d++) {
      edges.push({
        side: e.side,
        localIndex: e.localIndex * SCALE + d,
        type: e.type,
        crosswalk: false, // External edges never carry crosswalk; zone division is internal
      });
    }
  }

  const internalEdges: TileInternalEdge[] = [];
  for (const ie of def.internalEdges) {
    const isVertical = ie.fromX !== ie.toX;
    if (isVertical) {
      for (let d = 0; d < SCALE; d++) {
        internalEdges.push({
          fromX: ie.fromX * SCALE + (SCALE - 1),
          fromY: ie.fromY * SCALE + d,
          toX: ie.toX * SCALE,
          toY: ie.toY * SCALE + d,
          type: ie.type,
        });
      }
    } else {
      for (let d = 0; d < SCALE; d++) {
        internalEdges.push({
          fromX: ie.fromX * SCALE + d,
          fromY: ie.fromY * SCALE + (SCALE - 1),
          toX: ie.toX * SCALE + d,
          toY: ie.toY * SCALE,
          type: ie.type,
        });
      }
    }
  }

  // Expand doors if any (scale coordinates)
  const doors = (def.doors || []).map(d => ({
    x1: d.x1 * SCALE + Math.floor(SCALE / 2),
    y1: d.y1 * SCALE + Math.floor(SCALE / 2),
    x2: d.x2 * SCALE + Math.floor(SCALE / 2),
    y2: d.y2 * SCALE + Math.floor(SCALE / 2),
  }));

  return {
    ...def,
    gridSize: TILE_CELLS_PER_SIDE,
    cells,
    edges,
    internalEdges,
    doors: doors.length > 0 ? doors : undefined,
  };
}
