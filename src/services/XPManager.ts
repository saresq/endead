// src/services/XPManager.ts

import { Survivor, DangerLevel, GameState } from '../types/GameState';
import { SURVIVOR_CLASSES } from '../config/SkillRegistry';

const XP_THRESHOLDS: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 7,
  [DangerLevel.Orange]: 19,
  [DangerLevel.Red]: 43
};

const FREE_ACTION_SKILLS: Record<string, 'freeMovesRemaining' | 'freeSearchesRemaining' | 'freeCombatsRemaining' | 'freeMeleeRemaining' | 'freeRangedRemaining'> = {
  plus_1_free_move: 'freeMovesRemaining',
  plus_1_free_search: 'freeSearchesRemaining',
  plus_1_free_combat: 'freeCombatsRemaining',
  plus_1_free_melee: 'freeMeleeRemaining',
  plus_1_free_ranged: 'freeRangedRemaining',
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
   * Orange/Red skill choice the survivor still has to make, derived from
   * experience and owned skills (no stored flag). Orange comes first.
   */
  public static getPendingSkillChoice(survivor: Survivor): { level: DangerLevel; options: string[] } | null {
    const progression = SURVIVOR_CLASSES[survivor.characterClass] || SURVIVOR_CLASSES['Wanda'];
    const levels = [DangerLevel.Orange, DangerLevel.Red];
    for (const level of levels) {
      if (survivor.experience < XP_THRESHOLDS[level]) break;
      const options = progression[level];
      if (!options.some(skillId => survivor.skills.includes(skillId))) {
        return { level, options };
      }
    }
    return null;
  }

  public static canChooseSkill(survivor: Survivor, skillId: string): boolean {
    return !!this.getPendingSkillChoice(survivor)?.options.includes(skillId);
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

    // Apply immediate effects — Zombicide rules: "Immediately gains the benefit".
    if (skillId === 'plus_1_action') {
      updated.actionsPerTurn = survivor.actionsPerTurn + 1;
      updated.actionsRemaining = survivor.actionsRemaining + 1;
    }
    const freeCounter = FREE_ACTION_SKILLS[skillId];
    if (freeCounter) {
      updated[freeCounter] = (survivor[freeCounter] || 0) + 1;
    }

    return updated;
  }

  /**
   * Per-turn survivor reset (mutates). Used at game start and in the End Phase.
   */
  public static resetSurvivorTurn(survivor: Survivor): void {
    survivor.actionsRemaining = survivor.actionsPerTurn;
    survivor.hasMoved = false;
    survivor.hasSearched = false;
    survivor.freeMovesRemaining = 0;
    survivor.freeSearchesRemaining = 0;
    survivor.freeCombatsRemaining = 0;
    survivor.freeMeleeRemaining = 0;
    survivor.freeRangedRemaining = 0;
    for (const [skillId, counter] of Object.entries(FREE_ACTION_SKILLS)) {
      if (survivor.skills.includes(skillId)) survivor[counter] = 1;
    }
    survivor.toughUsedZombieAttack = false;
    survivor.toughUsedFriendlyFire = false;
    survivor.sprintUsedThisTurn = false;
    survivor.chargeUsedThisTurn = false;
    survivor.bornLeaderUsedThisTurn = false;
    survivor.bloodlustUsedThisTurn = false;
    survivor.lifesaverUsedThisTurn = false;
    survivor.hitAndRunFreeMove = false;
    survivor.luckyUsedThisTurn = false;
  }

  public static getDangerLevel(xp: number): DangerLevel {
    if (xp >= XP_THRESHOLDS[DangerLevel.Red]) return DangerLevel.Red;
    if (xp >= XP_THRESHOLDS[DangerLevel.Orange]) return DangerLevel.Orange;
    if (xp >= XP_THRESHOLDS[DangerLevel.Yellow]) return DangerLevel.Yellow;
    return DangerLevel.Blue;
  }
}
