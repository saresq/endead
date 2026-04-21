// src/services/XPManager.ts

import { Survivor, DangerLevel, GameState } from '../types/GameState';
import { SURVIVOR_CLASSES } from '../config/SkillRegistry';

const XP_THRESHOLDS: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 7,
  [DangerLevel.Orange]: 19,
  [DangerLevel.Red]: 43
};

export class XPManager {

  /**
   * Adds XP to a survivor and handles *automatic* level-ups (Blue/Yellow).
   * Does NOT auto-select Orange/Red skills to allow for player choice.
   */
  public static addXP(survivor: Survivor, amount: number): Survivor {
    let newSurvivor = { ...survivor };
    newSurvivor.experience += amount;

    // Recalculate Danger Level
    const oldLevel = newSurvivor.dangerLevel;
    const newLevel = this.getDangerLevel(newSurvivor.experience);
    
    if (newLevel !== oldLevel) {
      newSurvivor.dangerLevel = newLevel;
      
      // Auto-unlock skills for levels passed that have NO choice (Blue, Yellow usually)
      const progression = SURVIVOR_CLASSES[newSurvivor.characterClass] || SURVIVOR_CLASSES['Wanda'];
      
      // Check Blue (0 XP) - usually set at start, but just in case
      if (!newSurvivor.skills.includes(progression[DangerLevel.Blue][0])) {
         newSurvivor = this.unlockSkill(newSurvivor, progression[DangerLevel.Blue][0]);
      }

      // Check Yellow (7 XP)
      if (newSurvivor.experience >= XP_THRESHOLDS[DangerLevel.Yellow]) {
        const yellowSkill = progression[DangerLevel.Yellow][0];
        // Only unlock if it's the ONLY option (size 1)
        if (progression[DangerLevel.Yellow].length === 1 && !newSurvivor.skills.includes(yellowSkill)) {
           newSurvivor = this.unlockSkill(newSurvivor, yellowSkill);
        }
      }
    }

    return newSurvivor;
  }

  /**
   * Validates if a survivor CAN choose a specific skill at their current level.
   */
  public static canChooseSkill(survivor: Survivor, skillId: string): boolean {
    const progression = SURVIVOR_CLASSES[survivor.characterClass] || SURVIVOR_CLASSES['Wanda'];
    const level = survivor.dangerLevel;

    // 1. Check if already known
    if (survivor.skills.includes(skillId)) return false;

    // 2. Check if skill is in the pool for current level (or previous levels skipped?)
    // In Zombicide, you pick ONE skill per level band.
    
    // Check Orange
    if (level === DangerLevel.Orange || level === DangerLevel.Red) {
      // If we haven't picked an Orange skill yet...
      // How do we know? We check if ANY of the Orange options are in the skills list.
      const orangeOptions = progression[DangerLevel.Orange];
      const hasOrangeSkill = orangeOptions.some(s => survivor.skills.includes(s));
      
      if (!hasOrangeSkill && orangeOptions.includes(skillId)) {
        return true;
      }
    }

    // Check Red
    if (level === DangerLevel.Red) {
      const redOptions = progression[DangerLevel.Red];
      const hasRedSkill = redOptions.some(s => survivor.skills.includes(s));
      
      if (!hasRedSkill && redOptions.includes(skillId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Unlocks a skill and applies immediate stat bonuses (like +1 Action).
   * Returns a new survivor object (immutable).
   */
  public static unlockSkill(survivor: Survivor, skillId: string): Survivor {
    if (survivor.skills.includes(skillId)) return survivor;

    const updated = {
      ...survivor,
      skills: [...survivor.skills, skillId],
    };

    // Apply immediate effects. Zombicide rules: skills take effect the
    // moment they are acquired (RULEBOOK "Skills take effect immediately when
    // acquired"). For the per-turn free-pool skills the end-of-round reseed
    // handles subsequent turns, but the current turn's pool has to be
    // bumped here or the player silently loses the free Action they just
    // earned.
    if (skillId === 'plus_1_action') {
      updated.actionsPerTurn = survivor.actionsPerTurn + 1;
      updated.actionsRemaining = survivor.actionsRemaining + 1;
    } else if (skillId === 'plus_1_free_move') {
      updated.freeMovesRemaining = survivor.freeMovesRemaining + 1;
    } else if (skillId === 'plus_1_free_search') {
      updated.freeSearchesRemaining = survivor.freeSearchesRemaining + 1;
    } else if (skillId === 'plus_1_free_melee') {
      updated.freeMeleeRemaining = survivor.freeMeleeRemaining + 1;
    } else if (skillId === 'plus_1_free_ranged') {
      updated.freeRangedRemaining = survivor.freeRangedRemaining + 1;
    } else if (skillId === 'plus_1_free_combat') {
      updated.freeCombatsRemaining = survivor.freeCombatsRemaining + 1;
    }

    return updated;
  }

  public static getDangerLevel(xp: number): DangerLevel {
    if (xp >= XP_THRESHOLDS[DangerLevel.Red]) return DangerLevel.Red;
    if (xp >= XP_THRESHOLDS[DangerLevel.Orange]) return DangerLevel.Orange;
    if (xp >= XP_THRESHOLDS[DangerLevel.Yellow]) return DangerLevel.Yellow;
    return DangerLevel.Blue;
  }
}
