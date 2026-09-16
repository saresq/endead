
import { GameState, Survivor } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { XPManager } from '../XPManager';
import { visibleZones } from '../LineOfSight';
import { getConnection, isDoorBlocked } from './handlerUtils';
import { es, skillName } from '../../strings/es';

export function handleChooseSkill(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const skillId = intent.payload?.skillId;

  if (!survivor) throw new Error('Survivor not found');
  if (survivor.playerId !== intent.playerId) throw new Error(es.errors.notYourSurvivor);
  if (!skillId) throw new Error('Skill ID required');

  if (!XPManager.canChooseSkill(survivor, skillId)) {
    throw new Error(es.errors.cannotChooseSkill);
  }

  newState.survivors[intent.survivorId!] = XPManager.unlockSkill(survivor, skillId);
  return newState;
}

export function handleCharge(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('charge')) {
    throw new Error(es.errors.noSkill(skillName('charge')));
  }
  if (survivor.chargeUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('charge')));
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 1 || path.length > 2) {
    throw new Error(es.errors.pathLength(skillName('charge'), 1, 2));
  }

  // Validate path
  let currentZoneId = survivor.position.zoneId;
  for (const nextZoneId of path) {
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);
    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(es.errors.zonesNotConnected);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error(es.errors.doorClosedOnPath);
    }
    currentZoneId = nextZoneId;
  }

  // Destination must have at least 1 zombie
  const destZombies = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === currentZoneId
  );
  if (destZombies.length === 0) {
    throw new Error(es.errors.needZombieAtDestination(skillName('charge')));
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
    throw new Error(es.errors.noSkill(skillName('born_leader')));
  }
  if (survivor.bornLeaderUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('born_leader')));
  }
  if (!targetSurvivorId) throw new Error(es.errors.chooseSurvivor);

  const target = newState.survivors[targetSurvivorId];
  if (!target) throw new Error('Target survivor not found');
  if (target.wounds >= target.maxHealth) throw new Error(es.errors.targetDead);
  if (target.position.zoneId !== survivor.position.zoneId) {
    throw new Error(es.errors.sameZone);
  }
  if (target.id === survivor.id) {
    throw new Error(es.errors.giveActionSelf);
  }

  target.actionsRemaining += 1;
  survivor.bornLeaderUsedThisTurn = true;

  return newState;
}

export function handleBloodlustMelee(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('bloodlust_melee')) {
    throw new Error(es.errors.noSkill(skillName('bloodlust_melee')));
  }
  if (survivor.bloodlustUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('bloodlust_melee')));
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 1 || path.length > 2) {
    throw new Error(es.errors.pathLength(skillName('bloodlust_melee'), 1, 2));
  }

  // Validate path
  let currentZoneId = survivor.position.zoneId;
  for (const nextZoneId of path) {
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);
    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(es.errors.zonesNotConnected);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error(es.errors.doorClosedOnPath);
    }
    currentZoneId = nextZoneId;
  }

  // Destination must have at least 1 zombie
  const destZombies = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === currentZoneId
  );
  if (destZombies.length === 0) {
    throw new Error(es.errors.needZombieAtDestination(skillName('bloodlust_melee')));
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
    throw new Error(es.errors.noSkill(skillName('lifesaver')));
  }
  if (survivor.lifesaverUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('lifesaver')));
  }

  const targetZoneId = intent.payload?.targetZoneId;
  if (!targetZoneId) throw new Error('Target zone required');

  // Must be at Range 1 with LOS (a visible zone at Range 1 is always an open connection)
  if (visibleZones(state, survivor.position.zoneId).get(targetZoneId) !== 1) {
    throw new Error(es.errors.lifesaverRange);
  }

  // Target zone must have at least 1 zombie AND at least 1 survivor
  const zombiesInTarget = Object.values(newState.zombies).filter(
    (z: any) => z.position.zoneId === targetZoneId
  );
  if (zombiesInTarget.length === 0) {
    throw new Error(es.errors.lifesaverNeedsZombie);
  }

  const survivorIds: string[] = intent.payload?.targetSurvivorIds || [];
  if (survivorIds.length === 0) throw new Error(es.errors.lifesaverChooseSurvivor);

  const survivorsInTarget = (Object.values(newState.survivors) as Survivor[]).filter(
    s => s.position.zoneId === targetZoneId && s.id !== survivor.id && s.wounds < s.maxHealth
  );
  if (survivorsInTarget.length === 0) {
    throw new Error(es.errors.lifesaverNeedsSurvivor);
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
