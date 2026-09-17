
import { GameState, Survivor } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';
import { visibleZones } from '../LineOfSight';
import { walkMovePath, walkSurvivorMove, zoneHasZombies, zombiesInZone } from './handlerUtils';
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

  newState.survivors[intent.survivorId!] = XPManager.chooseSkill(survivor, skillId);
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

  // Normal movement rules apply (rules/14-skills.md#charge), so a middle zone holding
  // zombies is where the charge ends.
  const { zoneId: currentZoneId } = walkSurvivorMove(newState, survivor, path);

  // Destination must have at least 1 zombie
  if (!zoneHasZombies(newState, currentZoneId)) {
    throw new Error(es.errors.needZombieAtDestination(skillName('charge')));
  }

  survivor.position.zoneId = currentZoneId;
  survivor.chargeUsedThisTurn = true;

  return newState;
}

/** Where a player sits in this round's order; the first player token holder is 0. */
function roundPosition(state: GameState, playerId: string): number {
  const count = state.players.length;
  const index = state.players.indexOf(playerId);
  if (count === 0 || index < 0) return 0;
  return (index - state.firstPlayerTokenIndex + count) % count;
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
  if (target.id === survivor.id) {
    throw new Error(es.errors.giveActionSelf);
  }
  // The card grants the Action "used immediately" (rules/14-skills.md#born-leader) — no zone
  // restriction, but a player whose turn already passed this round can never
  // spend it, so refuse instead of losing it silently.
  if (roundPosition(newState, target.playerId) < roundPosition(newState, survivor.playerId)) {
    throw new Error(es.errors.targetTurnOver);
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

  // Same movement as Charge: a middle zone holding zombies ends the move.
  const { zoneId: currentZoneId } = walkSurvivorMove(newState, survivor, path);

  // Destination must have at least 1 zombie
  if (!zoneHasZombies(newState, currentZoneId)) {
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
  if (!zoneHasZombies(newState, targetZoneId)) {
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

/**
 * Jump (rules/14-skills.md#jump): once per Turn, 1 Action, move exactly 2 Zones and
 * ignore everything in the Zone crossed — zombies there neither stop the move
 * nor charge for being left. Walls and closed doors still block, and the
 * zombies in the Zone jumped *from* are still paid for.
 */
export function handleJump(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('jump')) {
    throw new Error(es.errors.noSkill(skillName('jump')));
  }
  if (survivor.jumpUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('jump')));
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length !== 2) {
    throw new Error(es.errors.pathLength(skillName('jump'), 2, 2));
  }

  // Movement Skills are ignored, so the walk never stops short; only the
  // zone left behind costs extra Actions.
  const { zoneId: landingZoneId } = walkMovePath(newState, survivor.position.zoneId, path, true);
  const extraAPCost = survivor.skills.includes('slippery')
    ? 0
    : zombiesInZone(newState, survivor.position.zoneId).length;
  if (extraAPCost > 0) newState._extraAPCost = extraAPCost;

  survivor.position.zoneId = landingZoneId;
  survivor.hasMoved = true;
  survivor.jumpUsedThisTurn = true;

  return newState;
}

/**
 * Shove (rules/14-skills.md#shove): once per Turn, free, push every zombie in the
 * survivor's Zone into a Zone at Range 1 with a clear path. Not a Movement, so
 * the survivor stays put and pays nothing for the zombies they were sharing a
 * Zone with.
 */
export function handleShove(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;

  if (!survivor.skills.includes('shove')) {
    throw new Error(es.errors.noSkill(skillName('shove')));
  }
  if (survivor.shoveUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('shove')));
  }
  if (!targetZoneId) throw new Error('Target zone required');

  // Range 1 with a clear path is exactly what line of sight gives at distance 1.
  if (visibleZones(newState, survivor.position.zoneId).get(targetZoneId) !== 1) {
    throw new Error(es.errors.shoveRange);
  }

  const pushed = zombiesInZone(newState, survivor.position.zoneId);
  if (pushed.length === 0) throw new Error(es.errors.shoveNeedsZombie);

  for (const zombie of pushed) {
    zombie.position.zoneId = targetZoneId;
  }

  survivor.shoveUsedThisTurn = true;

  newState.lastAction = {
    type: ActionType.SHOVE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: es.log.shoved(pushed.length),
  };

  return newState;
}
