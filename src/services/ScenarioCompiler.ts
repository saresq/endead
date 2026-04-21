
// src/services/ScenarioCompiler.ts
//
// Converts an authored ScenarioMap into runtime GameState zone topology,
// objectives, and placement data for START_GAME.
//
// Uses TileDefinitions for auto-classification of cells, and
// Union-Find for merging street cells into multi-cell street zones.

import { ScenarioMap, MapMarker, MarkerType, TileInstance, CrosswalkOverride } from '../types/Map';
import { Zone, ZoneConnection, ZoneId, Objective, ObjectiveType } from '../types/GameState';
import { TileDefinition, TileCellDef, TileEdgeDef, EdgeSide } from '../types/TileDefinition';
import { getRotatedTileDefinition, getCellAt, getEdgeAt, getInternalEdge } from './TileDefinitionService';
import { TILE_CELLS_PER_SIDE } from '../config/Layout';

export type EdgeClass = 'open' | 'wall' | 'crosswalk' | 'door' | 'doorway';

export interface CompiledScenario {
  zones: Record<ZoneId, Zone>;
  playerStartZoneId: string;
  spawnZoneIds: string[];
  exitZoneIds: string[];
  objectiveZoneIds: string[];
  objectives: Objective[];
  zoneGeometry: {
    zoneCells: Record<ZoneId, { x: number; y: number }[]>;
    cellToZone: Record<string, ZoneId>;
  };
  /** Edge classification for every adjacent cell pair. Key: "x1,y1|x2,y2" (normalized). */
  edgeClassMap: Record<string, EdgeClass>;
  /** Door positions from tile definitions. Key: same edge key format. */
  doorPositions: Record<string, { x1: number; y1: number; x2: number; y2: number; open: boolean }>;
  /** Cell type info. Key: "x,y". */
  cellTypes: Record<string, 'street' | 'building'>;
}

// --- Utilities ---

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`;
  const b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function zoneIdFromCell(x: number, y: number): string {
  return `z_${x}_${y}`;
}

// --- Union-Find ---

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  /** Get all groups as root → member keys */
  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(key);
    }
    return result;
  }
}

// --- Internal types ---

interface CellInfo {
  x: number;
  y: number;
  type: 'street' | 'building';
  tileRoomId?: string;     // Room ID from tile definition (tile-scoped)
  tileInstanceId?: string; // Which tile instance this cell belongs to
}

const DIRS = [
  { dx: 0, dy: -1 }, // N
  { dx: 0, dy: 1 },  // S
  { dx: -1, dy: 0 }, // W
  { dx: 1, dy: 0 },  // E
];

// --- Compiler ---

/**
 * Compile an authored ScenarioMap into runtime zone graph + placement data.
 * Uses tile definitions for cell classification and Union-Find for zone merging.
 */
export function compileScenario(map: ScenarioMap): CompiledScenario {
  // 1. Build cell info from tile definitions
  const cellInfoMap = new Map<string, CellInfo>();
  const tileDefMap = new Map<string, TileDefinition>(); // tileInstanceId → rotated def

  for (const tile of map.tiles) {
    const def = getRotatedTileDefinition(tile.tileId, tile.rotation);
    if (def) {
      tileDefMap.set(tile.id, def);
    }

    for (let dy = 0; dy < TILE_CELLS_PER_SIDE; dy++) {
      for (let dx = 0; dx < TILE_CELLS_PER_SIDE; dx++) {
        const gx = tile.x * TILE_CELLS_PER_SIDE + dx;
        const gy = tile.y * TILE_CELLS_PER_SIDE + dy;
        const key = cellKey(gx, gy);

        if (def) {
          const cellDef = getCellAt(def, dx, dy);
          if (cellDef) {
            cellInfoMap.set(key, {
              x: gx, y: gy,
              type: cellDef.type,
              tileRoomId: cellDef.roomId,
              tileInstanceId: tile.id,
            });
            continue;
          }
        }

        // Tile without definition: default to street
        if (!cellInfoMap.has(key)) {
          cellInfoMap.set(key, { x: gx, y: gy, type: 'street', tileInstanceId: tile.id });
        }
      }
    }
  }

  // 2. Build door lookup from tile definitions
  const doorLookup = new Map<string, { x1: number; y1: number; x2: number; y2: number; open: boolean }>();

  for (const tile of map.tiles) {
    const def = tileDefMap.get(tile.id);
    if (!def?.doors) continue;
    for (const d of def.doors) {
      const gx1 = tile.x * TILE_CELLS_PER_SIDE + d.x1;
      const gy1 = tile.y * TILE_CELLS_PER_SIDE + d.y1;
      const gx2 = tile.x * TILE_CELLS_PER_SIDE + d.x2;
      const gy2 = tile.y * TILE_CELLS_PER_SIDE + d.y2;
      const ek = edgeKey(gx1, gy1, gx2, gy2);
      doorLookup.set(ek, { x1: gx1, y1: gy1, x2: gx2, y2: gy2, open: false });
    }
  }

  // 4. Build crosswalk override lookup
  const crosswalkOverrides = new Map<string, boolean>();
  for (const co of (map.crosswalkOverrides || [])) {
    const ek = edgeKey(co.x1, co.y1, co.x2, co.y2);
    crosswalkOverrides.set(ek, co.hasCrosswalk);
  }

  // 5. Build marker lookup
  const markersByCell = new Map<string, MapMarker[]>();
  for (const marker of (map.markers || [])) {
    const key = cellKey(marker.x, marker.y);
    if (!markersByCell.has(key)) markersByCell.set(key, []);
    markersByCell.get(key)!.push(marker);
  }

  // 6. Classify edges between adjacent cells
  const edgeClassMap = new Map<string, EdgeClass>();

  for (const [key, info] of cellInfoMap) {
    for (const dir of DIRS) {
      const nx = info.x + dir.dx;
      const ny = info.y + dir.dy;
      const nkey = cellKey(nx, ny);
      const neighbor = cellInfoMap.get(nkey);
      if (!neighbor) continue;

      const ek = edgeKey(info.x, info.y, nx, ny);
      if (edgeClassMap.has(ek)) continue;

      // Crosswalk override takes priority
      if (crosswalkOverrides.has(ek)) {
        edgeClassMap.set(ek, crosswalkOverrides.get(ek)! ? 'crosswalk' : 'open');
        continue;
      }

      // Authored door takes priority
      if (doorLookup.has(ek)) {
        edgeClassMap.set(ek, 'door');
        continue;
      }

      // Same tile: check tile definition internal edges
      const sameTile = info.tileInstanceId === neighbor.tileInstanceId;

      if (sameTile && info.tileInstanceId) {
        const tile = map.tiles.find(t => t.id === info.tileInstanceId)!;
        const def = tileDefMap.get(info.tileInstanceId);
        if (def) {
          const localX1 = info.x - tile.x * TILE_CELLS_PER_SIDE;
          const localY1 = info.y - tile.y * TILE_CELLS_PER_SIDE;
          const localX2 = nx - tile.x * TILE_CELLS_PER_SIDE;
          const localY2 = ny - tile.y * TILE_CELLS_PER_SIDE;

          const ie = getInternalEdge(def, localX1, localY1, localX2, localY2);
          if (ie) {
            edgeClassMap.set(ek, ie.type === 'doorway' ? 'doorway' : ie.type === 'crosswalk' ? 'crosswalk' : ie.type === 'wall' ? 'wall' : 'open');
            continue;
          }

          // Fallback: check boundaryTypes for doorway entries (supports tiles
          // saved before doorway internal edges were emitted)
          if (def.boundaryTypes && info.tileRoomId && neighbor.tileRoomId && info.tileRoomId !== neighbor.tileRoomId) {
            const bKey = info.tileRoomId < neighbor.tileRoomId
              ? `${info.tileRoomId}|${neighbor.tileRoomId}`
              : `${neighbor.tileRoomId}|${info.tileRoomId}`;
            if (def.boundaryTypes[bKey] === 'doorway') {
              edgeClassMap.set(ek, 'doorway');
              continue;
            }
          }
        }

        edgeClassMap.set(ek, classifyByType(info, neighbor));
      } else {
        // Cross-tile edge
        edgeClassMap.set(ek, classifyCrossTileEdge(info, neighbor, map.tiles, tileDefMap));
      }
    }
  }

  // 7. Build zones using Union-Find for street merging
  const uf = new UnionFind();

  for (const key of cellInfoMap.keys()) {
    uf.add(key);
  }

  // Union building cells by room (from tile definitions)
  const tileRoomGroups = new Map<string, string[]>();
  for (const [key, info] of cellInfoMap) {
    if (info.type !== 'building') continue;

    if (info.tileRoomId && info.tileInstanceId) {
      const groupKey = `tile:${info.tileInstanceId}:${info.tileRoomId}`;
      if (!tileRoomGroups.has(groupKey)) tileRoomGroups.set(groupKey, []);
      tileRoomGroups.get(groupKey)!.push(key);
    }
  }

  for (const members of tileRoomGroups.values()) {
    for (let i = 1; i < members.length; i++) {
      uf.union(members[0], members[i]);
    }
  }

  // Union street cells where edge is 'open'
  for (const [key, info] of cellInfoMap) {
    if (info.type !== 'street') continue;
    for (const dir of DIRS) {
      const nx = info.x + dir.dx;
      const ny = info.y + dir.dy;
      const nkey = cellKey(nx, ny);
      const neighbor = cellInfoMap.get(nkey);
      if (!neighbor || neighbor.type !== 'street') continue;

      const ek = edgeKey(info.x, info.y, nx, ny);
      if (edgeClassMap.get(ek) === 'open') {
        uf.union(key, nkey);
      }
    }
  }

  // NOTE: doorway edges do NOT merge rooms — each room stays its own zone.
  // Doorways only create connections between zones (handled in step 10).

  // 8. Build zone IDs from union-find groups
  const groups = uf.groups();
  const cellToZone = new Map<string, ZoneId>();
  const zoneCells = new Map<ZoneId, { x: number; y: number }[]>();

  for (const [root, members] of groups) {
    const cells = members.map(k => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    }).sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    const rootInfo = cellInfoMap.get(root)!;
    let zoneId: ZoneId;
    if (members.length === 1) {
      zoneId = zoneIdFromCell(cells[0].x, cells[0].y);
    } else if (rootInfo.type === 'street') {
      zoneId = `sz_${cells[0].x}_${cells[0].y}`;
    } else {
      zoneId = `bz_${cells[0].x}_${cells[0].y}`;
    }

    zoneCells.set(zoneId, cells);
    for (const m of members) {
      cellToZone.set(m, zoneId);
    }
  }

  // 9. Create Zone objects
  const zones: Record<ZoneId, Zone> = {};

  for (const [zoneId, cells] of zoneCells) {
    const firstCellKey = cellKey(cells[0].x, cells[0].y);
    const firstInfo = cellInfoMap.get(firstCellKey)!;

    const allMarkers: MapMarker[] = [];
    for (const c of cells) {
      const m = markersByCell.get(cellKey(c.x, c.y));
      if (m) allMarkers.push(...m);
    }

    const isBuilding = firstInfo.type === 'building';

    // Determine if this zone is a dark room (from tile definition roomProperties)
    let isDark = false;
    if (isBuilding && firstInfo.tileInstanceId && firstInfo.tileRoomId) {
      const tileDef = tileDefMap.get(firstInfo.tileInstanceId);
      if (tileDef?.roomProperties?.[firstInfo.tileRoomId]?.isDark) {
        isDark = true;
      }
    }

    zones[zoneId] = {
      id: zoneId,
      connections: [],
      isBuilding,
      hasNoise: false,
      noiseTokens: 0,
      searchable: isBuilding,
      isDark,
      hasBeenSpawned: false,
      spawnPoint: allMarkers.some(m => m.type === MarkerType.ZombieSpawn),
      isExit: allMarkers.some(m => m.type === MarkerType.Exit),
      hasObjective: allMarkers.some(m => m.type === MarkerType.Objective),
    };
  }

  // 10. Build connections between zones
  const connectionSet = new Set<string>();

  for (const [key, info] of cellInfoMap) {
    const zoneId = cellToZone.get(key)!;

    for (const dir of DIRS) {
      const nx = info.x + dir.dx;
      const ny = info.y + dir.dy;
      const nkey = cellKey(nx, ny);
      if (!cellInfoMap.has(nkey)) continue;

      const neighborZoneId = cellToZone.get(nkey)!;
      if (zoneId === neighborZoneId) continue;

      const connKey = zoneId < neighborZoneId
        ? `${zoneId}|${neighborZoneId}`
        : `${neighborZoneId}|${zoneId}`;

      if (connectionSet.has(connKey)) continue;

      const ek = edgeKey(info.x, info.y, nx, ny);
      const cls = edgeClassMap.get(ek);

      if (cls === 'wall') continue;

      const neighborInfo = cellInfoMap.get(nkey)!;
      // 'door' and 'doorway' both allow cross-type and building-to-building connections
      const allowsPassage = cls === 'door' || cls === 'doorway';
      if (!allowsPassage && info.type !== neighborInfo.type) continue;

      if (!allowsPassage && info.type === 'building' && neighborInfo.type === 'building') {
        continue;
      }

      connectionSet.add(connKey);

      let hasDoor = false;
      let doorOpen = true;

      if (cls === 'door') {
        const door = doorLookup.get(ek);
        hasDoor = true;
        doorOpen = door ? door.open : false;
      }

      const conn: ZoneConnection = { toZoneId: neighborZoneId, hasDoor, doorOpen };
      const revConn: ZoneConnection = { toZoneId: zoneId, hasDoor, doorOpen };

      zones[zoneId].connections.push(conn);
      zones[neighborZoneId].connections.push(revConn);
    }
  }

  // Deduplicate connections
  for (const zone of Object.values(zones)) {
    const seen = new Set<string>();
    zone.connections = zone.connections.filter(c => {
      if (seen.has(c.toZoneId)) return false;
      seen.add(c.toZoneId);
      return true;
    });
  }

  // 11. Extract placement data from markers
  let playerStartZoneId = '';
  const spawnZoneIds: string[] = [];
  const exitZoneIds: string[] = [];
  const objectiveZoneIds: string[] = [];

  for (const marker of (map.markers || [])) {
    const ck = cellKey(marker.x, marker.y);
    const zid = cellToZone.get(ck);
    if (!zid) continue;

    switch (marker.type) {
      case MarkerType.PlayerStart:
        playerStartZoneId = zid;
        break;
      case MarkerType.ZombieSpawn:
        if (!spawnZoneIds.includes(zid)) spawnZoneIds.push(zid);
        break;
      case MarkerType.Exit:
        if (!exitZoneIds.includes(zid)) exitZoneIds.push(zid);
        break;
      case MarkerType.Objective:
        if (!objectiveZoneIds.includes(zid)) objectiveZoneIds.push(zid);
        break;
      case MarkerType.EpicCrate:
        // Editor-authored Epic Weapon Crate positions. Not yet wired into
        // gameplay (draw-from-epic-deck on take) — preserved in map data only.
        break;
    }
  }

  if (!playerStartZoneId) {
    const sorted = Object.keys(zones).sort();
    playerStartZoneId = sorted[0] || 'z_0_0';
  }

  // 12. Build objectives
  const objectives: Objective[] = [];

  if (exitZoneIds.length > 0) {
    objectives.push({
      id: 'obj-reach-exit',
      type: ObjectiveType.ReachExit,
      description: `All Survivors must reach the Exit`,
      targetId: exitZoneIds[0],
      amountRequired: 1,
      amountCurrent: 0,
      completed: false,
    });
  }

  if (objectiveZoneIds.length > 0) {
    objectives.push({
      id: 'obj-take-objectives',
      type: ObjectiveType.TakeObjective,
      description: `Collect all objective tokens (${objectiveZoneIds.length})`,
      amountRequired: objectiveZoneIds.length,
      amountCurrent: 0,
      completed: false,
    });
  }

  // Convert Maps to plain objects for serialization
  const zoneCellsRecord: Record<ZoneId, { x: number; y: number }[]> = {};
  for (const [zid, cells] of zoneCells) {
    zoneCellsRecord[zid] = cells;
  }
  const cellToZoneRecord: Record<string, ZoneId> = {};
  for (const [ck, zid] of cellToZone) {
    cellToZoneRecord[ck] = zid;
  }

  const edgeClassRecord: Record<string, EdgeClass> = {};
  for (const [ek, cls] of edgeClassMap) {
    edgeClassRecord[ek] = cls;
  }
  const doorPosRecord: Record<string, { x1: number; y1: number; x2: number; y2: number; open: boolean }> = {};
  for (const [ek, door] of doorLookup) {
    doorPosRecord[ek] = door;
  }
  const cellTypeRecord: Record<string, 'street' | 'building'> = {};
  for (const [ck, info] of cellInfoMap) {
    cellTypeRecord[ck] = info.type;
  }

  return {
    zones,
    playerStartZoneId,
    spawnZoneIds,
    exitZoneIds,
    objectiveZoneIds,
    objectives,
    zoneGeometry: {
      zoneCells: zoneCellsRecord,
      cellToZone: cellToZoneRecord,
    },
    edgeClassMap: edgeClassRecord,
    doorPositions: doorPosRecord,
    cellTypes: cellTypeRecord,
  };
}

// --- Edge classification helpers ---

function classifyByType(
  a: CellInfo,
  b: CellInfo,
): EdgeClass {
  if (a.type !== b.type) return 'wall';
  if (a.type === 'street') return 'open';

  // Both building: check if same room (from tile definitions)
  if (a.tileInstanceId === b.tileInstanceId && a.tileRoomId && a.tileRoomId === b.tileRoomId) return 'open';

  return 'wall';
}

function classifyCrossTileEdge(
  cellA: CellInfo,
  cellB: CellInfo,
  tiles: TileInstance[],
  tileDefMap: Map<string, TileDefinition>,
): EdgeClass {
  const tileA = tiles.find(t => t.id === cellA.tileInstanceId);
  const tileB = tiles.find(t => t.id === cellB.tileInstanceId);

  if (!tileA || !tileB) return classifyByType(cellA, cellB);

  const defA = tileDefMap.get(tileA.id);
  const defB = tileDefMap.get(tileB.id);

  if (!defA || !defB) return classifyByType(cellA, cellB);

  const dx = cellB.x - cellA.x;
  const dy = cellB.y - cellA.y;

  let sideA: EdgeSide;
  let sideB: EdgeSide;

  if (dx === 1) { sideA = 'east'; sideB = 'west'; }
  else if (dx === -1) { sideA = 'west'; sideB = 'east'; }
  else if (dy === 1) { sideA = 'south'; sideB = 'north'; }
  else { sideA = 'north'; sideB = 'south'; }

  const localAx = cellA.x - tileA.x * TILE_CELLS_PER_SIDE;
  const localAy = cellA.y - tileA.y * TILE_CELLS_PER_SIDE;
  const localBx = cellB.x - tileB.x * TILE_CELLS_PER_SIDE;
  const localBy = cellB.y - tileB.y * TILE_CELLS_PER_SIDE;

  const indexA = (sideA === 'north' || sideA === 'south') ? localAx : localAy;
  const indexB = (sideB === 'north' || sideB === 'south') ? localBx : localBy;

  const edgeA = getEdgeAt(defA, sideA, indexA);
  const edgeB = getEdgeAt(defB, sideB, indexB);

  // If edge definitions are missing, fall back to cell-type classification
  // instead of defaulting to wall — this allows cross-tile connections
  // for same-type cells (e.g., street-street stays open)
  if (!edgeA || !edgeB) return classifyByType(cellA, cellB);

  // Doorway flag takes priority — building edges have type 'wall' but a doorway
  // flag means the passage is open across the tile boundary.
  if (edgeA.doorway || edgeB.doorway) return 'doorway';

  if (edgeA.type === 'wall' || edgeB.type === 'wall') {
    // Sanity check: if both cells are streets, a wall edge is likely stale data
    if (cellA.type === 'street' && cellB.type === 'street') {
      console.warn(
        `Cross-tile edge mismatch: street cells at (${cellA.x},${cellA.y})-(${cellB.x},${cellB.y}) ` +
        `have wall edge. Edge data may be stale.`
      );
    }
    return 'wall';
  }

  return 'open';
}
