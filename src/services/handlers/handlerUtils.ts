
import { GameState, ZoneId, Zone, ZoneConnection, EquipmentCard, Survivor, Zombie, ZombieType } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { checkEndTurn } from '../TurnManager';
import { DeckService } from '../DeckService';
import { es } from '../../strings/es';

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

// --- Helper: Zombies standing in a zone ---
//
// Zone control is the same question everywhere — leaving costs extra Actions,
// entering ends a Move, Search is forbidden, Charge and Bloodlust need a target.
// One reading of the board, so the rules can't drift apart per call site.
export function zombiesInZone(state: GameState, zoneId: ZoneId): Zombie[] {
    return Object.values(state.zombies).filter(z => z.position.zoneId === zoneId);
}

export function zoneHasZombies(state: GameState, zoneId: ZoneId): boolean {
    return Object.values(state.zombies).some(z => z.position.zoneId === zoneId);
}

/**
 * Walks a movement path from `fromZoneId`, one zone at a time, and returns the
 * zone actually reached plus the extra Actions the walk cost. Throws when a step
 * is not connected or a closed door blocks it.
 *
 * Movement rules (rules/09-player-phase.md#move), the same for Move, Sprint, Charge and
 * Bloodlust: leaving a zone costs 1 extra Action per zombie in it, and entering
 * a zone with zombies ends the movement. Slippery (`ignoreZombies`) waives both.
 */
export function walkMovePath(
    state: GameState,
    fromZoneId: ZoneId,
    path: ZoneId[],
    ignoreZombies: boolean = false,
): { zoneId: ZoneId; extraAPCost: number } {
    let currentZoneId = fromZoneId;
    let extraAPCost = 0;

    for (const nextZoneId of path) {
        const currentZone = state.zones[currentZoneId];
        if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);
        if (!state.zones[nextZoneId]) throw new Error('Target zone invalid');

        if (!getConnection(currentZone, nextZoneId)) {
            throw new Error(es.errors.zonesNotConnected);
        }
        if (isDoorBlocked(currentZone, nextZoneId)) {
            throw new Error(path.length > 1 ? es.errors.doorClosedOnPath : es.errors.doorClosed);
        }

        if (!ignoreZombies) extraAPCost += zombiesInZone(state, currentZoneId).length;

        currentZoneId = nextZoneId;

        if (!ignoreZombies && zoneHasZombies(state, currentZoneId)) break;
    }

    return { zoneId: currentZoneId, extraAPCost };
}

/**
 * Walks one survivor's Move, applying Slippery: the skill waives the zombie
 * rules on every Move, a Kid waives them on one Move per Turn
 * (rules/03-setup.md#survivor-types). The Kid's use is spent only on a move it actually
 * changes — `survivor` is mutated when it is.
 */
export function walkSurvivorMove(
    state: GameState,
    survivor: Survivor,
    path: ZoneId[],
): { zoneId: ZoneId; extraAPCost: number } {
    if (survivor.skills.includes('slippery')) {
        return walkMovePath(state, survivor.position.zoneId, path, true);
    }

    const walk = walkMovePath(state, survivor.position.zoneId, path, false);

    const blocked = walk.extraAPCost > 0 || walk.zoneId !== path[path.length - 1];
    if (survivor.survivorType !== 'Kid' || survivor.kidSlipperyUsedThisTurn || !blocked) return walk;

    survivor.kidSlipperyUsedThisTurn = true;
    return walkMovePath(state, survivor.position.zoneId, path, true);
}

// --- Helper: Handle survivor death (drop equipment, mark as dead) ---
export function handleSurvivorDeath(state: GameState, survivorId: string): void {
    const survivor = state.survivors[survivorId];
    if (!survivor) return;

    // Drop all equipment into the zone's discard pile
    for (const card of survivor.inventory) {
        DeckService.discard(state, card);
    }
    survivor.inventory = [];
    if (survivor.drawnCard) {
        DeckService.discard(state, survivor.drawnCard);
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
export function deductAPWithFreeCheck(
  state: GameState,
  survivorId: string,
  actionType: ActionType,
  extraCost: number = 0,
  /** ATTACK only: which mode it resolved in, for the free melee/ranged actions. */
  isMelee?: boolean,
): GameState {
  const newState = { ...state };
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };

  // Cheat mode — skip AP deduction entirely and replenish to keep actions positive.
  if (survivor.cheatMode) {
    survivor.actionsRemaining = Math.max(survivor.actionsRemaining, survivor.actionsPerTurn);
    delete (newState as any)._extraAPCost;
    newSurvivors[survivorId] = survivor;
    newState.survivors = newSurvivors;
    return checkEndTurn(newState);
  }

  let usedFree = false;
  let freeType = '';

  // Sprint is a Move Action (rules/14-skills.md#sprint), so a free Move covers it.
  const isMoveAction = actionType === ActionType.MOVE || actionType === ActionType.SPRINT;

  if (isMoveAction && survivor.freeMovesRemaining > 0) {
    survivor.freeMovesRemaining--;
    usedFree = true;
    freeType = es.log.freeMove;
  } else if (actionType === ActionType.SEARCH && survivor.freeSearchesRemaining > 0) {
    survivor.freeSearchesRemaining--;
    usedFree = true;
    freeType = es.log.freeSearch;
  } else if (actionType === ActionType.ATTACK && survivor.freeMeleeRemaining > 0 && isMelee === true) {
    survivor.freeMeleeRemaining--;
    usedFree = true;
    freeType = es.log.freeMelee;
  } else if (actionType === ActionType.ATTACK && survivor.freeRangedRemaining > 0 && isMelee === false) {
    survivor.freeRangedRemaining--;
    usedFree = true;
    freeType = es.log.freeRanged;
  } else if (actionType === ActionType.ATTACK && survivor.freeCombatsRemaining > 0) {
    survivor.freeCombatsRemaining--;
    usedFree = true;
    freeType = es.log.freeCombat;
  }

  // Free action covers the base cost; the extra cost (zombies in the zone left) is always paid.
  const required = (usedFree ? 0 : 1) + extraCost;
  if (required > survivor.actionsRemaining) {
    throw new Error(es.errors.notEnoughActions(required));
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

/** End Phase: every `reload` weapon on the board goes back to loaded, for free. */
export function reloadAllWeapons(state: GameState): void {
  for (const survivor of Object.values(state.survivors)) {
    for (const card of survivor.inventory) {
      if (card.keywords?.includes('reload')) card.loaded = true;
    }
  }
}
