
import { GameState } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { walkSurvivorMove } from './handlerUtils';
import { es, skillName } from '../../strings/es';

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

  if (movePath.length > 2) throw new Error(es.errors.tooManyZones);
  if (movePath.length > 1 && !hasExtraZone) throw new Error(es.errors.oneZoneOnly);

  const { zoneId: currentZoneId, extraAPCost } = walkSurvivorMove(newState, survivor, movePath);

  if (extraAPCost > 0) {
    newState._extraAPCost = extraAPCost;
  }

  // Hit & Run free move: no zombie zone penalty
  if (survivor.hitAndRunFreeMove) {
    delete newState._extraAPCost;
    survivor.hitAndRunFreeMove = false;
  }

  survivor.position.zoneId = currentZoneId;
  survivor.hasMoved = true;

  newState.lastAction = {
    type: ActionType.MOVE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: es.log.moved,
  };

  return newState;
}

export function handleSprint(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('sprint')) {
    throw new Error(es.errors.noSkill(skillName('sprint')));
  }
  if (survivor.sprintUsedThisTurn && !survivor.cheatMode) {
    throw new Error(es.errors.skillUsed(skillName('sprint')));
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 2 || path.length > 3) {
    throw new Error(es.errors.pathLength(skillName('sprint'), 2, 3));
  }

  // Sprint is a Move Action of 2 or 3 zones (rules/14-skills.md#sprint): entering a zone
  // with zombies ends it wherever that happens, it does not fail.
  const { zoneId: currentZoneId, extraAPCost } = walkSurvivorMove(newState, survivor, path);

  if (extraAPCost > 0) {
    newState._extraAPCost = extraAPCost;
  }

  survivor.position.zoneId = currentZoneId;
  survivor.hasMoved = true;
  survivor.sprintUsedThisTurn = true;

  return newState;
}
