
import { GameState, Survivor } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { XPManager } from '../XPManager';
import { getConnection, isDoorBlocked, getDistance, hasLineOfSight } from './handlerUtils';

export function handleChooseSkill(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const skillId = intent.payload?.skillId;

  if (!skillId) throw new Error('Skill ID required');

  if (!XPManager.canChooseSkill(survivor, skillId)) {
    throw new Error(`Cannot choose skill ${skillId}`);
  }

  newState.survivors[intent.survivorId!] = XPManager.unlockSkill(survivor, skillId);
  return newState;
}

export function handleCharge(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('charge')) {
    throw new Error('Survivor does not have Charge skill');
  }
  if (survivor.chargeUsedThisTurn) {
    throw new Error('Charge already used this turn');
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 1 || path.length > 2) {
    throw new Error('Charge requires a path of 1-2 zones');
  }

  // Validate path
  let currentZoneId = survivor.position.zoneId;
  for (const nextZoneId of path) {
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);
    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(`Zones not connected: ${currentZoneId} -> ${nextZoneId}`);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error('Door is closed along charge path');
    }
    currentZoneId = nextZoneId;
  }

  // Destination must have at least 1 zombie
  const destZombies = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === currentZoneId
  );
  if (destZombies.length === 0) {
    throw new Error('Charge destination must contain at least 1 zombie');
  }

  survivor.position.zoneId = currentZoneId;
  survivor.chargeUsedThisTurn = true;

  return newState;
}

export function handleBornLeader(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  if (!survivor.skills.includes('born_leader')) {
    throw new Error('Survivor does not have Born Leader skill');
  }
  if (survivor.bornLeaderUsedThisTurn) {
    throw new Error('Born Leader already used this turn');
  }
  if (!targetSurvivorId) throw new Error('Target survivor required');

  const target = newState.survivors[targetSurvivorId];
  if (!target) throw new Error('Target survivor not found');
  if (target.wounds >= target.maxHealth) throw new Error('Target survivor is dead');
  if (target.position.zoneId !== survivor.position.zoneId) {
    throw new Error('Target must be in the same zone');
  }
  if (target.id === survivor.id) {
    throw new Error('Cannot give action to yourself');
  }

  target.actionsRemaining += 1;
  survivor.bornLeaderUsedThisTurn = true;

  return newState;
}

export function handleBloodlustMelee(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('bloodlust_melee')) {
    throw new Error('Survivor does not have Bloodlust: Melee skill');
  }
  if (survivor.bloodlustUsedThisTurn) {
    throw new Error('Bloodlust: Melee already used this turn');
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 1 || path.length > 2) {
    throw new Error('Bloodlust requires a path of 1-2 zones');
  }

  // Validate path
  let currentZoneId = survivor.position.zoneId;
  for (const nextZoneId of path) {
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);
    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(`Zones not connected: ${currentZoneId} -> ${nextZoneId}`);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error('Door is closed along path');
    }
    currentZoneId = nextZoneId;
  }

  // Destination must have at least 1 zombie
  const destZombies = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === currentZoneId
  );
  if (destZombies.length === 0) {
    throw new Error('Bloodlust destination must contain at least 1 zombie');
  }

  survivor.position.zoneId = currentZoneId;
  survivor.bloodlustUsedThisTurn = true;
  // Grant 1 free melee action
  survivor.freeMeleeRemaining = (survivor.freeMeleeRemaining || 0) + 1;

  return newState;
}

export function handleLifesaver(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('lifesaver')) {
    throw new Error('Survivor does not have Lifesaver skill');
  }
  if (survivor.lifesaverUsedThisTurn) {
    throw new Error('Lifesaver already used this turn');
  }

  const targetZoneId = intent.payload?.targetZoneId;
  if (!targetZoneId) throw new Error('Target zone required');

  // Must be at Range 1 with LOS and clear path
  const distance = getDistance(state, survivor.position.zoneId, targetZoneId);
  if (distance !== 1) throw new Error('Target zone must be at Range 1');
  if (!hasLineOfSight(newState, survivor.position.zoneId, targetZoneId)) {
    throw new Error('No line of sight to target zone');
  }

  // Check path is not blocked by door
  const currentZone = newState.zones[survivor.position.zoneId];
  if (isDoorBlocked(currentZone, targetZoneId)) {
    throw new Error('Path blocked by closed door');
  }

  // Target zone must have at least 1 zombie AND at least 1 survivor
  const zombiesInTarget = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === targetZoneId
  );
  if (zombiesInTarget.length === 0) {
    throw new Error('Target zone must contain at least 1 zombie');
  }

  const survivorIds: string[] = intent.payload?.targetSurvivorIds || [];
  if (survivorIds.length === 0) throw new Error('Must select at least 1 survivor to rescue');

  const survivorsInTarget = (Object.values(newState.survivors) as Survivor[]).filter(
    s => s.position.zoneId === targetZoneId && s.id !== survivor.id && s.wounds < s.maxHealth
  );
  if (survivorsInTarget.length === 0) {
    throw new Error('Target zone must contain at least 1 other survivor');
  }

  // Move selected survivors to Lifesaver's zone (not a Move Action — no penalties)
  for (const sid of survivorIds) {
    const target = newState.survivors[sid];
    if (!target) continue;
    if (target.position.zoneId !== targetZoneId) continue;
    if (target.wounds >= target.maxHealth) continue;
    target.position.zoneId = survivor.position.zoneId;
  }

  survivor.lifesaverUsedThisTurn = true;

  return newState;
}
