
import { GameState } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { getConnection, isDoorBlocked } from './handlerUtils';
import type { EventCollector } from '../EventCollector';

export function handleMove(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const targetId = intent.payload?.targetZoneId;
  const path: string[] | undefined = intent.payload?.path;

  // --- Validate-first: pure reads + throws, no mutation ---
  if (!targetId && (!path || path.length === 0)) throw new Error('Target zone required');

  const hasExtraZone = survivor.skills.includes('plus_1_zone_per_move');
  const movePath: string[] = (path && path.length > 0) ? path : [targetId];

  if (movePath.length > 2) throw new Error('Cannot move more than 2 zones');
  if (movePath.length > 1 && !hasExtraZone) throw new Error('Survivor cannot move 2 zones');

  // Walk the path computing cost + final landing zone — all reads, no writes.
  const isSlippery = survivor.skills.includes('slippery');
  let walkZoneId = survivor.position.zoneId;
  let extraAPCost = 0;
  let finalZoneId = walkZoneId;
  for (let i = 0; i < movePath.length; i++) {
    const nextZoneId = movePath[i];
    const currentZone = state.zones[walkZoneId];
    if (!currentZone) throw new Error('Current zone invalid');

    const nextZone = state.zones[nextZoneId];
    if (!nextZone) throw new Error('Target zone invalid');

    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(`Zones not connected: ${walkZoneId} -> ${nextZoneId}`);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error('Door is closed. You must open it first.');
    }

    if (!isSlippery) {
      const hasZombiesHere = Object.values(state.zombies)
        .some(z => z.position.zoneId === walkZoneId);
      if (hasZombiesHere) extraAPCost += 1;
    }

    walkZoneId = nextZoneId;
    finalZoneId = walkZoneId;

    // Entering a zone with zombies stops further movement (unless Slippery).
    if (i < movePath.length - 1 && !isSlippery) {
      const hasZombiesInNext = Object.values(state.zombies)
        .some(z => z.position.zoneId === nextZoneId);
      if (hasZombiesInNext) break;
    }
  }

  // --- Mutations + emits below ---
  const fromZoneId = survivor.position.zoneId;

  if (extraAPCost > 0) {
    collector.extraAPCost = extraAPCost;
  }

  survivor.position.zoneId = finalZoneId;
  survivor.hasMoved = true;

  state.lastAction = {
    type: ActionType.MOVE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Moved from ${fromZoneId} to ${finalZoneId}`,
  };

  collector.emit({
    type: 'SURVIVOR_MOVED',
    survivorId: intent.survivorId!,
    fromZoneId,
    toZoneId: finalZoneId,
  });
}

export function handleSprint(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];

  // --- Validate-first ---
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

  const isSlippery = survivor.skills.includes('slippery');
  let walkZoneId = survivor.position.zoneId;
  let extraAPCost = 0;
  let finalZoneId = walkZoneId;
  let stoppedByZombies = false;

  for (let i = 0; i < path.length; i++) {
    const targetZoneId = path[i];
    const currentZone = state.zones[walkZoneId];
    if (!currentZone) throw new Error(`Zone ${walkZoneId} invalid`);

    if (!getConnection(currentZone, targetZoneId)) {
      throw new Error(`Zones not connected: ${walkZoneId} -> ${targetZoneId}`);
    }
    if (isDoorBlocked(currentZone, targetZoneId)) {
      throw new Error('Door is closed along sprint path');
    }

    if (!isSlippery) {
      const hasZombiesHere = Object.values(state.zombies)
        .some(z => z.position.zoneId === walkZoneId);
      if (hasZombiesHere) extraAPCost += 1;
    }

    walkZoneId = targetZoneId;
    finalZoneId = walkZoneId;

    if (!isSlippery) {
      const hasZombiesInTarget = Object.values(state.zombies)
        .some(z => z.position.zoneId === targetZoneId);
      if (hasZombiesInTarget) {
        stoppedByZombies = true;
        break;
      }
    }
  }

  // --- Mutations + emits ---
  const fromZoneId = survivor.position.zoneId;
  if (extraAPCost > 0) collector.extraAPCost = extraAPCost;

  survivor.position.zoneId = finalZoneId;
  survivor.hasMoved = true;
  survivor.sprintUsedThisTurn = true;

  // SURVIVOR_SPRINTED carries the actual path walked (truncate when stopped).
  const walkedPath = stoppedByZombies ? path.slice(0, path.findIndex(z => z === finalZoneId) + 1) : path;
  collector.emit({
    type: 'SURVIVOR_SPRINTED',
    survivorId: intent.survivorId!,
    fromZoneId,
    path: walkedPath,
  });
}
