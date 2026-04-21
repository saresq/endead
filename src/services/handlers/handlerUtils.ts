
import { GameState, ZoneId, Zone, ZoneConnection, EquipmentCard, ZombieType } from '../../types/GameState';
import { ActionType, AttackFreePool, ActionRequest } from '../../types/Action';
import { advanceTurnState, checkEndTurn } from '../TurnManager';
import type { EventCollector } from '../EventCollector';

/**
 * SwarmComms handler contract (analysis §3.10).
 *   - Validate-first: throw before any mutation or emit.
 *   - Mutation-in-place: do not clone `state`; assign in place.
 *   - Emit through `collector` (server-authoritative event stream).
 *   - No return value: the dispatcher reads the same `state` object after.
 */
export type ActionHandler = (
  state: GameState,
  intent: ActionRequest,
  collector: EventCollector,
) => void;

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
 *
 * Mutates `state` in place. `isMelee` is passed explicitly (lifted off
 * `GameState._attackIsMelee` per D2) — required for ATTACK to key the
 * melee/ranged free pool correctly.
 *
 * Emits SURVIVOR_FREE_ACTION_CONSUMED / SURVIVOR_ACTIONS_REMAINING_CHANGED
 * via the collector so client UIs learn AP accounting happened. Turn
 * transitions flow through checkEndTurn / advanceTurnState which emit
 * ACTIVE_PLAYER_CHANGED + ZOMBIE_PHASE_STARTED as needed.
 */
export function deductAPWithFreeCheck(
  state: GameState,
  survivorId: string,
  actionType: ActionType,
  extraCost: number = 0,
  preferredFreePool?: AttackFreePool,
  isMelee?: boolean,
  collector?: EventCollector,
): void {
  const survivor = state.survivors[survivorId];

  let usedFree = false;
  let freeType = '';
  let freePool: 'move' | 'search' | 'combat' | 'melee' | 'ranged' | null = null;

  const tryMelee = () => {
    if (survivor.freeMeleeRemaining > 0 && isMelee === true) {
      survivor.freeMeleeRemaining--;
      usedFree = true;
      freeType = 'Free Melee';
      freePool = 'melee';
      return true;
    }
    return false;
  };
  const tryRanged = () => {
    if (survivor.freeRangedRemaining > 0 && isMelee === false) {
      survivor.freeRangedRemaining--;
      usedFree = true;
      freeType = 'Free Ranged';
      freePool = 'ranged';
      return true;
    }
    return false;
  };
  const tryCombat = () => {
    if (survivor.freeCombatsRemaining > 0) {
      survivor.freeCombatsRemaining--;
      usedFree = true;
      freeType = 'Free Combat';
      freePool = 'combat';
      return true;
    }
    return false;
  };

  if (actionType === ActionType.MOVE && survivor.freeMovesRemaining > 0) {
    survivor.freeMovesRemaining--;
    usedFree = true;
    freeType = 'Free Move';
    freePool = 'move';
  } else if (actionType === ActionType.SEARCH && survivor.freeSearchesRemaining > 0) {
    survivor.freeSearchesRemaining--;
    usedFree = true;
    freeType = 'Free Search';
    freePool = 'search';
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
    if (state.lastAction) {
      state.lastAction.usedFreeAction = true;
      state.lastAction.freeActionType = freeType;
    }
    if (freePool) {
      collector?.emit({
        type: 'SURVIVOR_FREE_ACTION_CONSUMED',
        survivorId,
        pool: freePool,
      });
    }
    if (extraCost > 0) {
      survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - extraCost);
      collector?.emit({
        type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
        survivorId,
        newCount: survivor.actionsRemaining,
      });
    }
    checkEndTurn(state, collector);
    return;
  }

  if (extraCost > 0) {
    survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - extraCost);
    collector?.emit({
      type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
      survivorId,
      newCount: survivor.actionsRemaining,
    });
  }

  advanceTurnState(state, survivorId, collector);
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
 * Grid cells that make up a zone (from zoneGeometry).
 * Throws if geometry is missing — maps without zoneGeometry are rejected at
 * compile time (see ScenarioCompiler.ts), so reaching here with missing cells
 * is a programmer error, not a runtime condition.
 */
export function getZoneCells(state: GameState, zoneId: ZoneId): { col: number; row: number }[] {
  const cells = state.zoneGeometry?.zoneCells[zoneId];
  if (!cells || cells.length === 0) {
    throw new Error(
      `getZoneCells: zone "${zoneId}" has no cells in zoneGeometry. This map should have been rejected at compile time.`,
    );
  }
  return cells.map(c => ({ col: c.x, row: c.y }));
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
