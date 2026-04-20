
import { GameState } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { getConnection, isDoorBlocked } from './handlerUtils';

export function handleMove(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetId = intent.payload?.targetZoneId;
  const path: string[] = intent.payload?.path; // Optional 2-zone path

  if (!targetId && (!path || path.length === 0)) throw new Error('Target zone required');

  const hasExtraZone = survivor.skills.includes('plus_1_zone_per_move');

  // Build the movement path
  let movePath: string[];
  if (path && path.length > 0) {
    movePath = path;
  } else {
    movePath = [targetId];
  }

  if (movePath.length > 2) throw new Error('Cannot move more than 2 zones');
  if (movePath.length > 1 && !hasExtraZone) throw new Error('Survivor cannot move 2 zones');

  let currentZoneId = survivor.position.zoneId;
  let extraAPCost = 0;

  for (let i = 0; i < movePath.length; i++) {
    const nextZoneId = movePath[i];
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error('Current zone invalid');

    const nextZone = newState.zones[nextZoneId];
    if (!nextZone) throw new Error('Target zone invalid');

    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(`Zones not connected: ${currentZoneId} -> ${nextZoneId}`);
    }

    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error('Door is closed. You must open it first.');
    }

    // Zombie zone control: leaving a zone with zombies costs +1 AP per zombie
    if (!survivor.skills.includes('slippery')) {
      const zombieCount = Object.values(newState.zombies)
        .filter((z: any) => z.position.zoneId === currentZoneId).length;
      extraAPCost += zombieCount;
    }

    currentZoneId = nextZoneId;

    // Entering a zone with zombies stops movement (unless Slippery)
    if (i < movePath.length - 1) {
      const hasZombiesInNext = Object.values(newState.zombies)
        .some((z: any) => z.position.zoneId === nextZoneId);
      if (hasZombiesInNext && !survivor.skills.includes('slippery')) {
        // Stop here — can't continue to second zone
        break;
      }
    }
  }

  if (extraAPCost > 0) {
    newState._extraAPCost = extraAPCost;
  }

  // Hit & Run free move: no zombie zone penalty
  if (survivor.hitAndRunFreeMove) {
    delete newState._extraAPCost;
    survivor.hitAndRunFreeMove = false;
  }

  const fromZoneId = state.survivors[intent.survivorId!].position.zoneId;
  survivor.position.zoneId = currentZoneId;
  survivor.hasMoved = true;

  newState.lastAction = {
    type: ActionType.MOVE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Moved from ${fromZoneId} to ${currentZoneId}`,
  };

  return newState;
}

export function handleSprint(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('sprint')) {
    throw new Error('Survivor does not have Sprint skill');
  }
  if (survivor.sprintUsedThisTurn) {
    throw new Error('Sprint already used this turn');
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 2 || path.length > 3) {
    throw new Error('Sprint requires a path of 2-3 zones');
  }

  let currentZoneId = survivor.position.zoneId;
  let extraAPCost = 0;

  for (let i = 0; i < path.length; i++) {
    const targetZoneId = path[i];
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);

    if (!getConnection(currentZone, targetZoneId)) {
      throw new Error(`Zones not connected: ${currentZoneId} -> ${targetZoneId}`);
    }

    if (isDoorBlocked(currentZone, targetZoneId)) {
      throw new Error('Door is closed along sprint path');
    }

    // Leaving a zone with zombies costs +1 AP per zombie (same as regular move)
    if (!survivor.skills.includes('slippery')) {
      const zombieCount = Object.values(newState.zombies)
        .filter((z: any) => z.position.zoneId === currentZoneId).length;
      extraAPCost += zombieCount;
    }

    currentZoneId = targetZoneId;

    // Entering a zone with zombies stops movement immediately (unless Slippery)
    if (!survivor.skills.includes('slippery')) {
      const hasZombiesInTarget = Object.values(newState.zombies)
        .some((z: any) => z.position.zoneId === targetZoneId);
      if (hasZombiesInTarget) {
        // Must have moved at least 2 zones for a valid sprint
        if (i + 1 < 2) {
          throw new Error('Sprint requires moving at least 2 zones but was stopped by zombies');
        }
        break;
      }
    }
  }

  if (extraAPCost > 0) {
    newState._extraAPCost = extraAPCost;
  }

  survivor.position.zoneId = currentZoneId;
  survivor.hasMoved = true;
  survivor.sprintUsedThisTurn = true;

  return newState;
}
