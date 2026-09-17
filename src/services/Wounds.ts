// src/services/Wounds.ts
//
// One path for wounding or killing a survivor, and one for recording a zombie
// kill. Survivor combat, friendly fire, the zombie attack step and Molotov all
// go through here, so wound-modifying skills behave the same wherever the wound
// comes from.

import { GameState, GamePhase, Survivor, Zombie, ObjectiveType } from '../types/GameState';
import { handleSurvivorDeath, getZombieXP } from './handlers/handlerUtils';

export interface WoundContext {
  /**
   * Identifies the instance Tough applies to — one zombie attack step, or one
   * ranged action's friendly fire. Tough ignores the first wound of each
   * distinct key. Omit to bypass Tough (Molotov kills outright).
   */
  toughKey?: string;
  /** Let "Is That All You've Got?" defer these wounds to a discard choice. Default true. */
  allowDiscardSave?: boolean;
  /** Record into `spawnContext.zombieWounds` for the phase report. Default false. */
  record?: boolean;
}

/**
 * Applies `amount` wounds to a survivor, honouring Tough and "Is That All
 * You've Got?", and handling death. A survivor already at max wounds is a no-op.
 */
export function applyWound(
  state: GameState,
  survivorId: string,
  amount: number,
  context: WoundContext = {},
): void {
  const survivor = state.survivors[survivorId];
  if (!survivor || amount <= 0) return;
  if (survivor.wounds >= survivor.maxHealth) return;

  let remaining = amount;

  // Tough: ignore exactly one wound of this instance, not the whole instance.
  if (
    context.toughKey &&
    survivor.skills?.includes('tough') &&
    survivor.toughUsedContext !== context.toughKey
  ) {
    survivor.toughUsedContext = context.toughKey;
    remaining -= 1;
    if (remaining <= 0) return;
  }

  // "Is That All You've Got?" — defer to the owner's equipment-discard choice.
  if (
    context.allowDiscardSave !== false &&
    survivor.skills?.includes('is_that_all_youve_got') &&
    survivor.inventory.length > 0
  ) {
    survivor.pendingWounds = (survivor.pendingWounds || 0) + remaining;
    return;
  }

  for (let i = 0; i < remaining; i++) {
    if (survivor.wounds >= survivor.maxHealth) break;
    survivor.wounds += 1;
    if (context.record) recordZombieWound(state, survivor);
  }

  if (survivor.wounds >= survivor.maxHealth) handleSurvivorDeath(state, survivor.id);
}

/** Adds one wound to this phase's record. No-op outside a zombie phase. */
export function recordZombieWound(state: GameState, survivor: Survivor): void {
  const wounds = state.spawnContext?.zombieWounds;
  if (!wounds || state.phase !== GamePhase.Zombies) return;
  const zoneId = survivor.position.zoneId;
  const rec = wounds.find(w => w.survivorId === survivor.id && w.zoneId === zoneId);
  if (rec) rec.amount += 1;
  else wounds.push({ survivorId: survivor.id, zoneId, amount: 1 });
}

/**
 * Removes a zombie, credits Kill Objectives once, and returns the XP it is
 * worth. The only place a zombie is killed by a survivor.
 */
export function recordKill(state: GameState, zombie: Zombie): number {
  delete state.zombies[zombie.id];

  for (const obj of state.objectives ?? []) {
    if (obj.type !== ObjectiveType.KillZombie || obj.completed) continue;
    if (obj.zombieType !== 'ANY' && obj.zombieType !== zombie.type) continue;
    obj.amountCurrent += 1;
    if (obj.amountCurrent >= obj.amountRequired) obj.completed = true;
  }

  return getZombieXP(zombie.type);
}
