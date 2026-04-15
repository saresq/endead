
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

    // Zero out actions so they can't act
    survivor.actionsRemaining = 0;
}

/**
 * Checks if a free action is available for this action type.
 * If so, consumes the free action instead of deducting AP.
 * Otherwise falls through to normal AP deduction via advanceTurnState.
 */
export function deductAPWithFreeCheck(state: GameState, survivorId: string, actionType: ActionType, extraCost: number = 0): GameState {
  const newState = { ...state };
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };

  let usedFree = false;
  let freeType = '';

  if (actionType === ActionType.MOVE && survivor.freeMovesRemaining > 0) {
    survivor.freeMovesRemaining--;
    usedFree = true;
    freeType = 'Free Move';
  } else if (actionType === ActionType.SEARCH && survivor.freeSearchesRemaining > 0) {
    survivor.freeSearchesRemaining--;
    usedFree = true;
    freeType = 'Free Search';
  } else if (actionType === ActionType.ATTACK && survivor.freeCombatsRemaining > 0) {
    survivor.freeCombatsRemaining--;
    usedFree = true;
    freeType = 'Free Combat';
  } else if (actionType === ActionType.ATTACK && survivor.freeMeleeRemaining > 0 && state._attackIsMelee) {
    survivor.freeMeleeRemaining--;
    usedFree = true;
    freeType = 'Free Melee';
  } else if (actionType === ActionType.ATTACK && survivor.freeRangedRemaining > 0 && state._attackIsMelee === false) {
    survivor.freeRangedRemaining--;
    usedFree = true;
    freeType = 'Free Ranged';
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
 * BFS-based Line of Sight check for ranged attacks.
 * An attack path is blocked if it must pass through a wall-blocked edge
 * or a closed door. Returns true if there exists a path with no wall/closed-door edges.
 */
export function hasLineOfSight(state: GameState, startZoneId: ZoneId, endZoneId: ZoneId): boolean {
  if (startZoneId === endZoneId) return true;

  const queue: ZoneId[] = [startZoneId];
  const visited = new Set<string>();
  visited.add(startZoneId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const zone = state.zones[current];
    if (!zone) continue;

    for (const conn of zone.connections) {
      if (visited.has(conn.toZoneId)) continue;

      // Block LOS through closed doors
      if (conn.hasDoor && !conn.doorOpen) continue;

      visited.add(conn.toZoneId);
      if (conn.toZoneId === endZoneId) return true;
      queue.push(conn.toZoneId);
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
