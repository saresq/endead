
import { GameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { XPManager } from '../XPManager';
import { getConnection, isDoorBlocked } from './handlerUtils';
import type { EventCollector } from '../EventCollector';

export function handleChooseSkill(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const skillId = intent.payload?.skillId;

  // --- Validate-first ---
  if (!skillId) throw new Error('Skill ID required');
  if (!XPManager.canChooseSkill(survivor, skillId)) {
    throw new Error(`Cannot choose skill ${skillId}`);
  }

  // --- Mutations + emits ---
  state.survivors[intent.survivorId!] = XPManager.unlockSkill(survivor, skillId);
  collector.emit({
    type: 'SURVIVOR_SKILL_CHOSEN',
    survivorId: intent.survivorId!,
    skillId,
  });
}

export function handleCharge(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];

  // --- Validate-first ---
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

  let walkZoneId = survivor.position.zoneId;
  for (const nextZoneId of path) {
    const currentZone = state.zones[walkZoneId];
    if (!currentZone) throw new Error(`Zone ${walkZoneId} invalid`);
    if (!getConnection(currentZone, nextZoneId)) {
      throw new Error(`Zones not connected: ${walkZoneId} -> ${nextZoneId}`);
    }
    if (isDoorBlocked(currentZone, nextZoneId)) {
      throw new Error('Door is closed along charge path');
    }
    walkZoneId = nextZoneId;
  }

  const destZombies = Object.values(state.zombies).filter(
    z => z.position.zoneId === walkZoneId
  );
  if (destZombies.length === 0) {
    throw new Error('Charge destination must contain at least 1 zombie');
  }

  // --- Mutations + emits ---
  const fromZoneId = survivor.position.zoneId;
  survivor.position.zoneId = walkZoneId;
  survivor.chargeUsedThisTurn = true;
  collector.emit({
    type: 'SURVIVOR_MOVED',
    survivorId: intent.survivorId!,
    fromZoneId,
    toZoneId: walkZoneId,
  });
}

export function handleBornLeader(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  // --- Validate-first ---
  if (!survivor.skills.includes('born_leader')) {
    throw new Error('Survivor does not have Born Leader skill');
  }
  if (survivor.bornLeaderUsedThisTurn) {
    throw new Error('Born Leader already used this turn');
  }
  if (!targetSurvivorId) throw new Error('Target survivor required');

  const target = state.survivors[targetSurvivorId];
  if (!target) throw new Error('Target survivor not found');
  if (target.wounds >= target.maxHealth) throw new Error('Target survivor is dead');
  if (target.position.zoneId !== survivor.position.zoneId) {
    throw new Error('Target must be in the same zone');
  }
  if (target.id === survivor.id) {
    throw new Error('Cannot give action to yourself');
  }

  // --- Mutations + emits ---
  // Born Leader: "give 1 free Action to another Survivor (used immediately)".
  // In this engine AP == one Action slot, so granting a free Action is the
  // same mutation as bumping the target's actionsRemaining. Donor pays nothing
  // — Born Leader is itself a free skill Action gated by once-per-Turn.
  target.actionsRemaining += 1;
  survivor.bornLeaderUsedThisTurn = true;
  collector.emit({
    type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
    survivorId: target.id,
    newCount: target.actionsRemaining,
  });
}

