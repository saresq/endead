
import { GameState, ZoneId, Zone, ZoneConnection, EquipmentCard, ZombieType } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { advanceTurnState, checkEndTurn } from '../TurnManager';

export type ActionHandler = (state: GameState, intent: any) => GameState;

// --- Helper: Get edge connection between two zones ---
export function getConnection(zone: Zone, targetZoneId: ZoneId): ZoneConnection | undefined {
    return zone.connections.find(c => c.toZoneId === targetZoneId);
}

// --- Helper: Check if door blocks passage on an edge ---
export function isDoorBlocked(zone: Zone, targetZoneId: ZoneId): boolean {
    const conn = getConnection(zone, targetZoneId);
    if (!conn) return true; // Not connected at all
    return conn.hasDoor && !conn.doorOpen;
}

// --- Helper: Open a door on an edge (both sides) ---
export function openDoorEdge(state: GameState, zoneAId: ZoneId, zoneBId: ZoneId): void {
    const zoneA = state.zones[zoneAId];
    const zoneB = state.zones[zoneBId];

    const connAB = zoneA?.connections.find(c => c.toZoneId === zoneBId);
    const connBA = zoneB?.connections.find(c => c.toZoneId === zoneAId);

    if (connAB) connAB.doorOpen = true;
    if (connBA) connBA.doorOpen = true;
}

// --- Helper: Handle survivor death (drop equipment, mark as dead) ---
export function handleSurvivorDeath(state: GameState, survivorId: string): void {
    const survivor = state.survivors[survivorId];
    if (!survivor) return;

    // Drop all equipment into the zone's discard pile
    for (const card of survivor.inventory) {
        state.equipmentDiscard.push(card);
    }
    survivor.inventory = [];
    if (survivor.drawnCard) {
        state.equipmentDiscard.push(survivor.drawnCard);
        survivor.drawnCard = undefined;
    }
    if (survivor.drawnCardsQueue && survivor.drawnCardsQueue.length > 0) {
        for (const card of survivor.drawnCardsQueue) state.equipmentDiscard.push(card);
        survivor.drawnCardsQueue = undefined;
    }

    // Zero out actions so they can't act
    survivor.actionsRemaining = 0;
}

/**
 * Checks if a free action is available for this action type.
 * If so, consumes the free action instead of deducting AP.
 * Otherwise falls through to normal AP deduction via advanceTurnState.
 */
export type FreePool = 'combat' | 'melee' | 'ranged' | 'move' | 'search';

export function deductAPWithFreeCheck(
  state: GameState,
  survivorId: string,
  actionType: ActionType,
  extraCost: number = 0,
  preferredFreePool?: FreePool,
): GameState {
  const newState = { ...state };
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };

  let usedFree = false;
  let freeType = '';

  const tryMelee = () => {
    if (survivor.freeMeleeRemaining > 0 && state._attackIsMelee) {
      survivor.freeMeleeRemaining--;
      usedFree = true;
      freeType = 'Free Melee';
      return true;
    }
    return false;
  };
  const tryRanged = () => {
    if (survivor.freeRangedRemaining > 0 && state._attackIsMelee === false) {
      survivor.freeRangedRemaining--;
      usedFree = true;
      freeType = 'Free Ranged';
      return true;
    }
    return false;
  };
  const tryCombat = () => {
    if (survivor.freeCombatsRemaining > 0) {
      survivor.freeCombatsRemaining--;
      usedFree = true;
      freeType = 'Free Combat';
      return true;
    }
    return false;
  };

  if (actionType === ActionType.MOVE && survivor.freeMovesRemaining > 0) {
    survivor.freeMovesRemaining--;
    usedFree = true;
    freeType = 'Free Move';
  } else if (actionType === ActionType.SEARCH && survivor.freeSearchesRemaining > 0) {
    survivor.freeSearchesRemaining--;
    usedFree = true;
    freeType = 'Free Search';
  } else if (actionType === ActionType.ATTACK) {
    // Honor player-preferred pool when specified and available; otherwise
    // default to combat → melee → ranged (legacy order).
    const order: (() => boolean)[] =
      preferredFreePool === 'melee' ? [tryMelee, tryCombat, tryRanged] :
      preferredFreePool === 'ranged' ? [tryRanged, tryCombat, tryMelee] :
      preferredFreePool === 'combat' ? [tryCombat, tryMelee, tryRanged] :
      [tryCombat, tryMelee, tryRanged];
    for (const fn of order) if (fn()) break;
  }

  if (usedFree) {
    // Tag lastAction with free action info
    if (newState.lastAction) {
      newState.lastAction.usedFreeAction = true;
      newState.lastAction.freeActionType = freeType;
    }
    // Free action covers the base cost; only apply extra cost (e.g. zombie zone penalty)
    if (extraCost > 0) {
      survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - extraCost);
    }
    newSurvivors[survivorId] = survivor;
    newState.survivors = newSurvivors;
    return checkEndTurn(newState);
  }

  // No free action — normal AP deduction (including any extra cost)
  newSurvivors[survivorId] = survivor;
  newState.survivors = newSurvivors;

  if (extraCost > 0) {
    // Deduct extra cost on top of the normal 1 AP from advanceTurnState
    const s = { ...newState.survivors[survivorId] };
    s.actionsRemaining = Math.max(0, s.actionsRemaining - extraCost);
    newState.survivors = { ...newState.survivors, [survivorId]: s };
  }

  return advanceTurnState(newState, survivorId);
}

export function getDistance(state: GameState, startZoneId: ZoneId, endZoneId: ZoneId): number {
  if (startZoneId === endZoneId) return 0;

  const queue: { id: ZoneId; dist: number }[] = [{ id: startZoneId, dist: 0 }];
  const visited = new Set<string>();
  visited.add(startZoneId);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (id === endZoneId) return dist;

    if (dist > 10) continue;

    const zone = state.zones[id];
    if (!zone) continue;

    for (const conn of zone.connections) {
      if (!visited.has(conn.toZoneId)) {
        visited.add(conn.toZoneId);
        queue.push({ id: conn.toZoneId, dist: dist + 1 });
      }
    }
  }
  return Infinity;
}

/**
 * Grid cells that make up a zone (from zoneGeometry). Empty when no geometry.
 */
export function getZoneCells(state: GameState, zoneId: ZoneId): { col: number; row: number }[] {
  if (state.zoneGeometry?.zoneCells[zoneId]) {
    return state.zoneGeometry.zoneCells[zoneId].map(c => ({ col: c.x, row: c.y }));
  }
  return [];
}

/**
 * Line of Sight (RULEBOOK §5):
 *   - Street↔Street: orthogonal straight line, any length
 *   - Street→Building: orthogonal straight line, limited to 1 Zone into the building
 *   - Building→Street: through any number of street zones in a straight line
 *   - Building↔Building: only via shared opening (adjacent, doorway or open door)
 *   - Same zone: always
 *   - Closed doors and walls block LOS
 */
export function hasLineOfSight(state: GameState, startZoneId: ZoneId, endZoneId: ZoneId): boolean {
  if (startZoneId === endZoneId) return true;

  const startZone = state.zones[startZoneId];
  const endZone = state.zones[endZoneId];
  if (!startZone || !endZone) return false;

  // Building↔Building: only via direct shared opening (adjacent with open edge)
  if (startZone.isBuilding && endZone.isBuilding) {
    const conn = startZone.connections.find(c => c.toZoneId === endZoneId);
    if (!conn) return false;
    if (conn.hasDoor && !conn.doorOpen) return false;
    return true;
  }

  const cellsA = getZoneCells(state, startZoneId);
  const cellsB = getZoneCells(state, endZoneId);
  if (cellsA.length === 0 || cellsB.length === 0) return false;

  for (const a of cellsA) {
    for (const b of cellsB) {
      const sameRow = a.row === b.row;
      const sameCol = a.col === b.col;
      if (!sameRow && !sameCol) continue;
      const axis: 'row' | 'col' = sameRow ? 'row' : 'col';
      const axisValue = sameRow ? a.row : a.col;
      if (raycastLos(state, startZoneId, endZoneId, axis, axisValue)) return true;
    }
  }
  return false;
}

/**
 * BFS along a single orthogonal axis with building-depth tracking.
 * `buildingsEntered` counts building zones traversed (including the start
 * if start is a building). Paths that would traverse more than 1 building
 * zone are blocked (Street→Building limit / no Building→Building pass-through).
 */
function raycastLos(
  state: GameState,
  startId: ZoneId,
  endId: ZoneId,
  axis: 'row' | 'col',
  axisValue: number,
): boolean {
  const startZone = state.zones[startId];
  const startDepth = startZone.isBuilding ? 1 : 0;
  const queue: { id: ZoneId; buildingsEntered: number }[] = [
    { id: startId, buildingsEntered: startDepth },
  ];
  const best: Record<string, number> = { [startId]: startDepth };

  while (queue.length > 0) {
    const { id, buildingsEntered } = queue.shift()!;
    if (id === endId) return true;

    const zone = state.zones[id];
    if (!zone) continue;
    for (const conn of zone.connections) {
      if (conn.hasDoor && !conn.doorOpen) continue;

      const neighbor = state.zones[conn.toZoneId];
      if (!neighbor) continue;

      const neighborCells = getZoneCells(state, conn.toZoneId);
      const onAxis = neighborCells.some(c =>
        axis === 'row' ? c.row === axisValue : c.col === axisValue,
      );
      if (!onAxis) continue;

      const nextDepth = buildingsEntered + (neighbor.isBuilding ? 1 : 0);
      if (nextDepth > 1) continue;

      const prev = best[conn.toZoneId];
      if (prev !== undefined && prev <= nextDepth) continue;
      best[conn.toZoneId] = nextDepth;
      queue.push({ id: conn.toZoneId, buildingsEntered: nextDepth });
    }
  }
  return false;
}

export function getZombieToughness(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Brute: return 2;
    case ZombieType.Abomination: return 3;
  }
}

export function getZombieXP(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Brute: return 1;
    case ZombieType.Abomination: return 5;
  }
}
