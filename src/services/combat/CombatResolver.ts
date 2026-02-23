// src/services/combat/CombatResolver.ts

import { GameState, EquipmentCard, ZoneId } from '../../types/GameState';
import { TargetSelector } from './TargetSelector';
import { rollDice, DiceResult } from '../DiceService';

export interface CombatResult {
  hits: number;
  rolls: number[];
  victims: string[];
  newState: GameState;
}

export class CombatResolver {

  /**
   * Resolves a Ranged Attack action.
   */
  public static resolveRangedAttack(
    state: GameState,
    weapon: EquipmentCard,
    targetZoneId: ZoneId,
    bonusDice: number = 0,
    bonusDamage: number = 0
  ): CombatResult {
    const newState = JSON.parse(JSON.stringify(state)); // Deep clone
    
    // 1. Roll Dice
    const stats = weapon.stats;
    if (!stats) throw new Error('Weapon has no stats');

    const totalDice = stats.dice + bonusDice;
    const damage = stats.damage + bonusDamage;
    const accuracy = stats.accuracy;

    const rollResult: DiceResult = rollDice(newState.seed, totalDice, accuracy);
    newState.seed = rollResult.newSeed;

    // 2. Identify Targets
    // "Mixed Zones" rule implies prioritizing specific types.
    const targets = TargetSelector.getPrioritizedTargets(newState, targetZoneId);

    // 3. Allocate Hits
    const victims = TargetSelector.allocateHits(targets, rollResult.hits, damage);

    // 4. Apply Damage / Death
    // This part modifies the state (removes zombies, wounds survivors)
    this.applyCombatEffects(newState, victims);

    // 5. Generate Noise (if weapon is noisy)
    if (stats.noise) {
       // Add noise to survivor's zone (not target zone, usually, unless explosion?)
       // Standard: Noise token in survivor's zone.
       // We need the survivor's ID/Zone to place noise. 
       // This resolver is currently pure logic, caller needs to handle noise placement 
       // or we pass survivor location.
       // Ideally, ActionProcessor handles side effects like Noise.
       // We'll leave noise to ActionProcessor.
    }

    return {
      hits: rollResult.hits,
      rolls: rollResult.rolls,
      victims,
      newState
    };
  }

  private static applyCombatEffects(state: GameState, victimIds: string[]) {
    for (const id of victimIds) {
      // Check if Zombie
      if (state.zombies[id]) {
        // Kill Zombie
        // Add XP to Active Player (Wait, we don't have active player ID here)
        // We'll just remove them for now. XP logic should be handled by caller or passed in.
        delete state.zombies[id];
      }
      // Check if Survivor
      else if (state.survivors[id]) {
        // Wound Survivor
        const survivor = state.survivors[id];
        survivor.wounds += 1;
        // Drop equipment if needed? (Zombicide: Wound = Discard 1 equipment)
        // We leave that complexity for now.
        if (survivor.wounds >= survivor.maxHealth) {
           // Dead?
           // Handle death logic
        }
      }
    }
  }
}
