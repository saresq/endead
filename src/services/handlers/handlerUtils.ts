
import { GameState, ZoneId, Zone, ZoneConnection, EquipmentCard, ZombieType } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { checkEndTurn } from '../TurnManager';

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
 * Charges an action: a matching free action covers the base cost, otherwise 1 AP.
 * `extraCost` (zombies in the zone left) is always paid in AP. Throws when the
 * survivor cannot pay the full cost — never clamps.
 */
export function deductAPWithFreeCheck(state: GameState, survivorId: string, actionType: ActionType, extraCost: number = 0): GameState {
  const newState = { ...state };
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };

  // Cheat mode — skip AP deduction entirely and replenish to keep actions positive.
  if (survivor.cheatMode) {
    survivor.actionsRemaining = Math.max(survivor.actionsRemaining, survivor.actionsPerTurn);
    delete (newState as any)._extraAPCost;
    delete (newState as any)._attackIsMelee;
    newSurvivors[survivorId] = survivor;
    newState.survivors = newSurvivors;
    return checkEndTurn(newState);
  }

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
  } else if (actionType === ActionType.ATTACK && survivor.freeMeleeRemaining > 0 && state._attackIsMelee) {
    survivor.freeMeleeRemaining--;
    usedFree = true;
    freeType = 'Free Melee';
  } else if (actionType === ActionType.ATTACK && survivor.freeRangedRemaining > 0 && state._attackIsMelee === false) {
    survivor.freeRangedRemaining--;
    usedFree = true;
    freeType = 'Free Ranged';
  } else if (actionType === ActionType.ATTACK && survivor.freeCombatsRemaining > 0) {
    survivor.freeCombatsRemaining--;
    usedFree = true;
    freeType = 'Free Combat';
  }

  // Free action covers the base cost; the extra cost (zombies in the zone left) is always paid.
  const required = (usedFree ? 0 : 1) + extraCost;
  if (required > survivor.actionsRemaining) {
    throw new Error(`Not enough actions (need ${required})`);
  }
  survivor.actionsRemaining -= required;

  if (usedFree && newState.lastAction) {
    newState.lastAction.usedFreeAction = true;
    newState.lastAction.freeActionType = freeType;
  }

  newSurvivors[survivorId] = survivor;
  newState.survivors = newSurvivors;
  return checkEndTurn(newState);
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
