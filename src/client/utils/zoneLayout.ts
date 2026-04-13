// src/client/utils/zoneLayout.ts
//
// Shared zone layout resolver. Supports both:
//   - V1 single-cell zones: z_x_y format (parsed from ID)
//   - V2 multi-cell zones: sz_x_y / bz_x_y (looked up from zoneGeometry)

import { ZoneId } from '../../types/GameState';

export interface ZoneLayout {
  col: number;   // Top-left column (or single cell column)
  row: number;   // Top-left row (or single cell row)
  w: number;     // Bounding box width in cells
  h: number;     // Bounding box height in cells
  cells?: { x: number; y: number }[]; // Exact cell list for multi-cell zones
  centroidX?: number; // Average X position (in cell coords)
  centroidY?: number; // Average Y position (in cell coords)
}

/** Zone geometry lookup table — set by the renderer when state is received */
let _zoneGeometry: {
  zoneCells: Record<ZoneId, { x: number; y: number }[]>;
  cellToZone: Record<string, ZoneId>;
} | null = null;

/**
 * Set the zone geometry data (called once when game state is loaded).
 */
export function setZoneGeometry(geom: typeof _zoneGeometry): void {
  _zoneGeometry = geom ?? null;
}

/**
 * Resolve the grid layout for a zone ID.
 *
 * For single-cell zones (z_x_y): returns col/row from ID, w=h=1.
 * For multi-cell zones (sz_x_y, bz_x_y): computes bounding box and centroid
 * from zoneGeometry lookup.
 */
export function getZoneLayout(zoneId: ZoneId): ZoneLayout {
  // Try zoneGeometry first (works for all zone types)
  if (_zoneGeometry?.zoneCells[zoneId]) {
    const cells = _zoneGeometry.zoneCells[zoneId];
    if (cells.length > 0) {
      const xs = cells.map(c => c.x);
      const ys = cells.map(c => c.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        col: minX,
        row: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        cells,
        centroidX: xs.reduce((a, b) => a + b, 0) / xs.length,
        centroidY: ys.reduce((a, b) => a + b, 0) / ys.length,
      };
    }
  }

  // Fallback: parse zone ID format (z_x_y, sz_x_y, bz_x_y)
  const parts = zoneId.split('_');
  if (parts.length === 3) {
    const col = parseInt(parts[1]);
    const row = parseInt(parts[2]);
    if (!isNaN(col) && !isNaN(row)) {
      return { col, row, w: 1, h: 1, cells: [{ x: col, y: row }], centroidX: col, centroidY: row };
    }
  }

  return { col: 0, row: 0, w: 1, h: 1 };
}

/**
 * Get the zone ID that contains a specific cell coordinate.
 */
export function getZoneAtCell(x: number, y: number): ZoneId | undefined {
  if (!_zoneGeometry) return undefined;
  return _zoneGeometry.cellToZone[`${x},${y}`];
}
