
// src/services/ScenarioCompiler.ts
//
// Converts an authored ScenarioMap into runtime GameState zone topology,
// objectives, and placement data for START_GAME.

import { ScenarioMap, MapMarker, MapDoor, MapRoom, MarkerType, TileInstance, isLegacyMap } from '../types/Map';
import { Zone, ZoneConnection, ZoneId, Objective, ObjectiveType } from '../types/GameState';

export interface CompiledScenario {
  zones: Record<ZoneId, Zone>;
  playerStartZoneId: string;      // Zone where survivors spawn
  spawnZoneIds: string[];          // Zombie spawn point zone IDs
  exitZoneIds: string[];           // Exit zone IDs
  objectiveZoneIds: string[];      // Zones with objective tokens
  objectives: Objective[];         // Scenario objectives for win condition
}

/**
 * Build a canonical edge key so both sides of an edge resolve the same.
 */
function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`;
  const b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function zoneIdFromCell(x: number, y: number): string {
  return `z_${x}_${y}`;
}

/**
 * Compile an authored ScenarioMap into runtime zone graph + placement data.
 */
export function compileScenario(map: ScenarioMap): CompiledScenario {
  const zones: Record<ZoneId, Zone> = {};

  // 1. Build room lookup: cell key -> room
  const cellToRoom = new Map<string, MapRoom>();
  for (const room of (map.rooms || [])) {
    for (const cell of room.cells) {
      cellToRoom.set(`${cell.x},${cell.y}`, room);
    }
  }

  // 2. Build door lookup: edge key -> MapDoor
  const doorLookup = new Map<string, MapDoor>();
  for (const door of (map.doors || [])) {
    const ek = edgeKey(door.x1, door.y1, door.x2, door.y2);
    doorLookup.set(ek, door);
  }

  // 3. Build marker lookup: cell key -> markers
  const markersByCell = new Map<string, MapMarker[]>();
  for (const marker of (map.markers || [])) {
    const key = `${marker.x},${marker.y}`;
    if (!markersByCell.has(key)) markersByCell.set(key, []);
    markersByCell.get(key)!.push(marker);
  }

  // 4. Determine zone cells from tiles (each tile = 3x3 zones)
  const occupiedCells = new Set<string>();
  for (const tile of map.tiles) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const gx = tile.x * 3 + dx;
        const gy = tile.y * 3 + dy;
        occupiedCells.add(`${gx},${gy}`);
      }
    }
  }

  // 5. Create Zone for each occupied cell
  for (const cellKey of occupiedCells) {
    const [cx, cy] = cellKey.split(',').map(Number);
    const id = zoneIdFromCell(cx, cy);
    const room = cellToRoom.get(cellKey);
    const markers = markersByCell.get(cellKey) || [];

    const isBuilding = !!room;
    const hasSpawn = markers.some(m => m.type === MarkerType.ZombieSpawn);
    const hasExit = markers.some(m => m.type === MarkerType.Exit);
    const hasObjective = markers.some(m => m.type === MarkerType.Objective);

    zones[id] = {
      id,
      connections: [],       // Populated in step 6
      connectedZones: [],    // Populated in step 6
      isBuilding,
      hasNoise: false,
      noiseTokens: 0,
      searchable: isBuilding,
      doorOpen: true,        // Legacy compat default
      spawnPoint: hasSpawn,
      isExit: hasExit,
      hasObjective,
    };
  }

  // 6. Build connections between cardinal neighbors
  const DIRS = [
    { dx: 0, dy: -1 }, // N
    { dx: 0, dy: 1 },  // S
    { dx: -1, dy: 0 }, // W
    { dx: 1, dy: 0 },  // E
  ];

  for (const cellKey of occupiedCells) {
    const [cx, cy] = cellKey.split(',').map(Number);
    const id = zoneIdFromCell(cx, cy);
    const zone = zones[id];
    const room = cellToRoom.get(cellKey);

    for (const dir of DIRS) {
      const nx = cx + dir.dx;
      const ny = cy + dir.dy;
      const neighborKey = `${nx},${ny}`;

      if (!occupiedCells.has(neighborKey)) continue; // No neighbor = wall (map edge)

      const neighborId = zoneIdFromCell(nx, ny);
      const neighborRoom = cellToRoom.get(neighborKey);

      // Check for an authored door on this edge
      const ek = edgeKey(cx, cy, nx, ny);
      const door = doorLookup.get(ek);

      let hasDoor = false;
      let doorOpen = true;

      if (door) {
        // Explicit door placed by author
        hasDoor = true;
        doorOpen = door.open;
      } else {
        // Auto-infer: if crossing building/street boundary without explicit door, 
        // it's a wall (not connected). Same-type neighbors are open passages.
        const thisIsBuilding = !!room;
        const neighborIsBuilding = !!neighborRoom;

        if (thisIsBuilding !== neighborIsBuilding) {
          // Building <-> Street with no authored door = wall, skip connection
          continue;
        }

        if (thisIsBuilding && neighborIsBuilding && room !== neighborRoom) {
          // Different rooms with no door = wall between rooms
          continue;
        }

        // Same room or both street: open passage
        hasDoor = false;
        doorOpen = true;
      }

      const conn: ZoneConnection = { toZoneId: neighborId, hasDoor, doorOpen };
      zone.connections.push(conn);
      zone.connectedZones.push(neighborId);
    }
  }

  // 7. Extract placement data from markers
  let playerStartZoneId = '';
  const spawnZoneIds: string[] = [];
  const exitZoneIds: string[] = [];
  const objectiveZoneIds: string[] = [];

  for (const marker of (map.markers || [])) {
    const zid = zoneIdFromCell(marker.x, marker.y);
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
    }
  }

  // Fallback: if no player start authored, use first zone
  if (!playerStartZoneId) {
    const sorted = Object.keys(zones).sort();
    playerStartZoneId = sorted[0] || 'z_0_0';
  }

  // 8. Build objectives
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

  return {
    zones,
    playerStartZoneId,
    spawnZoneIds,
    exitZoneIds,
    objectiveZoneIds,
    objectives,
  };
}

/**
 * Fallback compiler for legacy maps that only have tiles (no rooms/doors/markers).
 * Produces the same flat grid as the old generateZonesFromTiles.
 */
export function compileLegacyTiles(tiles: TileInstance[]): CompiledScenario {
  // Wrap in a minimal ScenarioMap with no authored logic
  const map: ScenarioMap = {
    id: 'legacy',
    name: 'Legacy',
    width: Math.max(...tiles.map(t => t.x)) + 1,
    height: Math.max(...tiles.map(t => t.y)) + 1,
    tiles,
    rooms: [],
    doors: [],
    markers: [],
  };

  const result = compileScenario(map);

  // Legacy behavior: first zone = start, last zone = exit
  const sortedIds = Object.keys(result.zones).sort();
  result.playerStartZoneId = sortedIds[0];
  
  const exitId = sortedIds[sortedIds.length - 1];
  if (result.zones[exitId]) {
    result.zones[exitId].isExit = true;
  }
  result.exitZoneIds = [exitId];

  result.objectives = [{
    id: 'obj-reach-exit',
    type: ObjectiveType.ReachExit,
    description: `Reach the Exit (${exitId})`,
    targetId: exitId,
    amountRequired: 1,
    amountCurrent: 0,
    completed: false,
  }];

  return result;
}
