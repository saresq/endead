import type { GameState, ZoneId } from '../types/GameState';

const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`;
  const b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Straight-line Line of Sight (RULEBOOK: orthogonal lines from any cell of the
 * zone). Returns every visible zone mapped to its Range (zone boundaries
 * crossed; the origin is Range 0).
 *
 * A line stops at the board edge, a wall, a closed door, or an edge the
 * compiler would not connect. It stops after entering a building zone, which
 * gives: street→street unlimited, street→building 1 zone, building→street
 * unlimited, building→building 1 zone.
 */
export function visibleZones(state: GameState, fromZoneId: ZoneId): Map<ZoneId, number> {
  const geometry = state.zoneGeometry;
  const edgeClassMap = state.edgeClassMap;
  if (!geometry || !edgeClassMap) throw new Error('Missing zone geometry');

  const cells = geometry.zoneCells[fromZoneId];
  if (!cells || cells.length === 0) throw new Error(`Missing zone geometry for ${fromZoneId}`);

  const result = new Map<ZoneId, number>([[fromZoneId, 0]]);

  for (const cell of cells) {
    for (const { dx, dy } of DIRECTIONS) {
      let zoneId = fromZoneId;
      let range = 0;
      let x = cell.x;
      let y = cell.y;

      while (true) {
        const nx = x + dx;
        const ny = y + dy;
        const nextZoneId = geometry.cellToZone[`${nx},${ny}`];
        if (!nextZoneId) break;

        if (nextZoneId !== zoneId) {
          const zone = state.zones[zoneId];
          const nextZone = state.zones[nextZoneId];
          const cls = edgeClassMap[edgeKey(x, y, nx, ny)];
          if (cls === 'wall') break;
          // Without a door or doorway, only street-to-street edges are passable.
          if (cls !== 'door' && cls !== 'doorway' && (zone.isBuilding || nextZone.isBuilding)) break;
          const conn = zone.connections.find(c => c.toZoneId === nextZoneId);
          if (!conn || (conn.hasDoor && !conn.doorOpen)) break;

          range++;
          const known = result.get(nextZoneId);
          if (known === undefined || range < known) result.set(nextZoneId, range);
          if (nextZone.isBuilding) break;
          zoneId = nextZoneId;
        }

        x = nx;
        y = ny;
      }
    }
  }

  return result;
}
