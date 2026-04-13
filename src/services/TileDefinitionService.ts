// src/services/TileDefinitionService.ts
//
// Provides tile definition lookup, rotation transforms, and 3x3→9x9 expansion.

import {
  TileDefinition,
  TileCellDef,
  TileEdgeDef,
  TileInternalEdge,
  TileDoorDef,
  EdgeSide,
} from '../types/TileDefinition';
import { TILE_DEFINITIONS } from '../config/TileDefinitions';
import { TILE_CELLS_PER_SIDE } from '../config/Layout';

// --- Rotation helpers ---

/** Rotate a point within a grid by 90 degrees CW, N times. */
function rotatePoint(x: number, y: number, steps: number, gridSize: number = TILE_CELLS_PER_SIDE): [number, number] {
  let rx = x, ry = y;
  for (let i = 0; i < steps; i++) {
    const tmp = rx;
    rx = (gridSize - 1) - ry;
    ry = tmp;
  }
  return [rx, ry];
}

const SIDE_ORDER: EdgeSide[] = ['north', 'east', 'south', 'west'];

/** Rotate an edge side by N 90-degree CW steps. */
function rotateSide(side: EdgeSide, steps: number): EdgeSide {
  const idx = SIDE_ORDER.indexOf(side);
  return SIDE_ORDER[(idx + steps) % 4];
}

/**
 * Rotate an edge's localIndex by mapping it through cell rotation.
 * The edge index corresponds to a cell on the tile perimeter.
 */
function rotateEdgeIndex(origSide: EdgeSide, localIndex: number, steps: number, gridSize: number = TILE_CELLS_PER_SIDE): number {
  const max = gridSize - 1;
  let cx: number, cy: number;

  switch (origSide) {
    case 'north': cx = localIndex; cy = 0; break;
    case 'south': cx = localIndex; cy = max; break;
    case 'east':  cx = max; cy = localIndex; break;
    case 'west':  cx = 0; cy = localIndex; break;
  }

  const [rx, ry] = rotatePoint(cx, cy, steps, gridSize);
  const newSide = rotateSide(origSide, steps);

  switch (newSide) {
    case 'north': return rx;
    case 'south': return rx;
    case 'east':  return ry;
    case 'west':  return ry;
  }
}

// Re-export for convenience
export { expand3x3to9x9 } from '../config/tileDefExpander';

// --- Public API ---

/**
 * Apply rotation to a tile definition, returning a new definition
 * with transformed coordinates and edge mappings.
 */
export function rotateTileDefinition(
  def: TileDefinition,
  rotation: 0 | 90 | 180 | 270,
): TileDefinition {
  if (rotation === 0) return def;

  const gs = def.gridSize || 3;
  const steps = rotation / 90;

  const cells: TileCellDef[] = def.cells.map(c => {
    const [rx, ry] = rotatePoint(c.localX, c.localY, steps, gs);
    return { ...c, localX: rx, localY: ry };
  });

  const edges: TileEdgeDef[] = def.edges.map(e => ({
    ...e,
    side: rotateSide(e.side, steps),
    localIndex: rotateEdgeIndex(e.side, e.localIndex, steps, gs),
  }));

  const internalEdges: TileInternalEdge[] = def.internalEdges.map(ie => {
    const [fx, fy] = rotatePoint(ie.fromX, ie.fromY, steps, gs);
    const [tx, ty] = rotatePoint(ie.toX, ie.toY, steps, gs);
    return { ...ie, fromX: fx, fromY: fy, toX: tx, toY: ty };
  });

  const doors: TileDoorDef[] = (def.doors || []).map(d => {
    const [rx1, ry1] = rotatePoint(d.x1, d.y1, steps, gs);
    const [rx2, ry2] = rotatePoint(d.x2, d.y2, steps, gs);
    return { x1: rx1, y1: ry1, x2: rx2, y2: ry2 };
  });

  return { ...def, cells, edges, internalEdges, doors };
}

/**
 * Get a tile definition by ID, optionally rotated.
 */
export function getRotatedTileDefinition(
  tileId: string,
  rotation: 0 | 90 | 180 | 270 = 0,
): TileDefinition | undefined {
  const def = TILE_DEFINITIONS[tileId];
  if (!def) return undefined;
  return rotateTileDefinition(def, rotation);
}

/**
 * Look up the cell definition at a local position within a (possibly rotated) tile.
 */
export function getCellAt(
  def: TileDefinition,
  localX: number,
  localY: number,
): TileCellDef | undefined {
  return def.cells.find(c => c.localX === localX && c.localY === localY);
}

/**
 * Get the edge definition for a specific side and index.
 */
export function getEdgeAt(
  def: TileDefinition,
  side: EdgeSide,
  localIndex: number,
): TileEdgeDef | undefined {
  return def.edges.find(e => e.side === side && e.localIndex === localIndex);
}

/**
 * Get the internal edge between two adjacent cells, if one is defined.
 */
export function getInternalEdge(
  def: TileDefinition,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): TileInternalEdge | undefined {
  return def.internalEdges.find(ie =>
    (ie.fromX === x1 && ie.fromY === y1 && ie.toX === x2 && ie.toY === y2) ||
    (ie.fromX === x2 && ie.fromY === y2 && ie.toX === x1 && ie.toY === y1)
  );
}

/**
 * Repair external edges of a tile definition by syncing edge `type` from
 * perimeter cell types. External edges never carry crosswalk (crosswalks
 * are always internal edges). Preserves `doorway` flags from existing entries.
 */
export function repairExternalEdges(def: TileDefinition): void {
  const gs = def.gridSize || TILE_CELLS_PER_SIDE;

  // Build lookup of existing edges for doorway preservation
  const existingEdges = new Map<string, TileEdgeDef>();
  for (const e of def.edges) {
    existingEdges.set(`${e.side}:${e.localIndex}`, e);
  }

  const newEdges: TileEdgeDef[] = [];
  const sides: { side: EdgeSide; getCell: (i: number) => { x: number; y: number } }[] = [
    { side: 'north', getCell: (i) => ({ x: i, y: 0 }) },
    { side: 'south', getCell: (i) => ({ x: i, y: gs - 1 }) },
    { side: 'east', getCell: (i) => ({ x: gs - 1, y: i }) },
    { side: 'west', getCell: (i) => ({ x: 0, y: i }) },
  ];

  for (const { side, getCell } of sides) {
    for (let i = 0; i < gs; i++) {
      const { x, y } = getCell(i);
      const cell = def.cells.find(c => c.localX === x && c.localY === y);
      const cellType = cell?.type ?? 'street';
      const existing = existingEdges.get(`${side}:${i}`);

      newEdges.push({
        side,
        localIndex: i,
        type: cellType === 'street' ? 'street' : 'wall',
        crosswalk: false, // External edges never carry crosswalk
        doorway: existing?.doorway,
      });
    }
  }

  def.edges = newEdges;
}
