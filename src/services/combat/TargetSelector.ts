// src/services/combat/TargetSelector.ts

import { GameState, ZombieType, ZoneId } from '../../types/GameState';

export enum TargetType {
  SURVIVOR = 'SURVIVOR',
  ZOMBIE = 'ZOMBIE'
}

export interface CombatTarget {
  type: TargetType;
  id: string;
  subType: string; // ZombieType or 'SURVIVOR'
  minDamage: number; // Damage required to kill/wound
  priority: number;
}

const PROMPT_PRIORITY: Record<string, number> = {
  'SURVIVOR': 1,
  [ZombieType.Fatty]: 2,
  [ZombieType.Abomination]: 2, 
  [ZombieType.Runner]: 3,
  [ZombieType.Walker]: 4
};

const DAMAGE_THRESHOLD: Record<string, number> = {
  'SURVIVOR': 1, // Any hit wounds
  [ZombieType.Walker]: 1,
  [ZombieType.Runner]: 1,
  [ZombieType.Fatty]: 2,
  [ZombieType.Abomination]: 3
};

export class TargetSelector {

  /**
   * Returns a sorted list of valid targets in a zone based on the Prompt's strict priority.
   * Lower number = Higher Priority (Hit first).
   */
  public static getPrioritizedTargets(state: GameState, zoneId: ZoneId): CombatTarget[] {
    const targets: CombatTarget[] = [];

    // 1. Survivors (Friendly Fire)
    const survivors = Object.values(state.survivors).filter(s => s.position.zoneId === zoneId);
    for (const s of survivors) {
      targets.push({
        type: TargetType.SURVIVOR,
        id: s.id,
        subType: 'SURVIVOR',
        minDamage: 1,
        priority: PROMPT_PRIORITY['SURVIVOR']
      });
    }

    // 2. Zombies
    const zombies = Object.values(state.zombies).filter(z => z.position.zoneId === zoneId);
    for (const z of zombies) {
      const priority = PROMPT_PRIORITY[z.type] ?? 99;
      const minDamage = DAMAGE_THRESHOLD[z.type] ?? 1;
      
      targets.push({
        type: TargetType.ZOMBIE,
        id: z.id,
        subType: z.type,
        minDamage,
        priority
      });
    }

    // Sort by Priority (Ascending) -> Then by ID (Deterministic tie-break)
    return targets.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Allocates hits to targets based on priority and damage capability.
   * 
   * @param targets Sorted list of targets in the zone
   * @param hits Number of successful hits
   * @param damagePerHit Damage value of the weapon
   * @returns List of entity IDs that are killed/wounded
   */
  public static allocateHits(targets: CombatTarget[], hits: number, damagePerHit: number): string[] {
    const victims: string[] = [];
    let remainingHits = hits;

    for (const target of targets) {
      if (remainingHits <= 0) break;

      // EXCEPTION: Survivors always take wounds if hit (Priority 1 implies they take hits first in this rule set).
      // If Friendly Fire is active, they take it.
      
      if (target.type === TargetType.SURVIVOR || damagePerHit >= target.minDamage) {
        victims.push(target.id);
        remainingHits--;
      } else {
        // Damage too low. Target is IGNORED (skipped).
        // Proceed to next target in priority list.
      }
    }
    
    return victims; 
  }
}
