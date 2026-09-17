// src/services/XPManager.ts

import { Survivor, DangerLevel, GameState } from '../types/GameState';
import { SURVIVOR_CLASSES, skillCount } from '../config/SkillRegistry';

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
      const progression = SURVIVOR_CLASSES[newSurvivor.characterClass];
      if (!progression) return newSurvivor;
      
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
   * experience and the choices already recorded. Orange comes first.
   */
  public static getPendingSkillChoice(survivor: Survivor): { level: DangerLevel; options: string[] } | null {
    const progression = SURVIVOR_CLASSES[survivor.characterClass];
    if (!progression) return null;
    const levels = [DangerLevel.Orange, DangerLevel.Red];
    for (const level of levels) {
      if (survivor.experience < XP_THRESHOLDS[level]) break;
      const options = progression[level];
      if (options.length > 0 && !survivor.skillChoices?.[level]) {
        return { level, options };
      }
    }
    return null;
  }

  public static canChooseSkill(survivor: Survivor, skillId: string): boolean {
    return !!this.getPendingSkillChoice(survivor)?.options.includes(skillId);
  }

  /**
   * Takes the survivor's pending Orange/Red choice. Records which option was
   * taken — a card may offer one the survivor already owns, and the record is
   * what closes the level.
   */
  public static chooseSkill(survivor: Survivor, skillId: string): Survivor {
    const pending = this.getPendingSkillChoice(survivor);
    if (!pending || !pending.options.includes(skillId)) return survivor;

    // Always a new copy: the option may be one the survivor already owns.
    const updated = this.gainSkill(survivor, skillId);
    return { ...updated, skillChoices: { ...survivor.skillChoices, [pending.level]: skillId } };
  }

  /**
   * Unlocks a skill the survivor does not have yet. Used for the fixed Blue and
   * Yellow levels, where re-reaching a level must not grant a second copy.
   */
  public static unlockSkill(survivor: Survivor, skillId: string): Survivor {
    if (survivor.skills.includes(skillId)) return survivor;
    return this.gainSkill(survivor, skillId);
  }

  /**
   * Adds one copy of a skill and applies its immediate effect — Zombicide
   * rules: "Immediately gains the benefit". A second copy stacks with the
   * first; `skillCount` is what reads the total.
   * Returns a new survivor object (immutable).
   */
  private static gainSkill(survivor: Survivor, skillId: string): Survivor {
    const updated = {
      ...survivor,
      skills: [...survivor.skills, skillId],
    };

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
      const copies = skillCount(survivor.skills, skillId);
      if (copies > 0) survivor[counter] = copies;
    }
    survivor.sprintUsedThisTurn = false;
    survivor.chargeUsedThisTurn = false;
    survivor.bornLeaderUsedThisTurn = false;
    survivor.bloodlustUsedThisTurn = false;
    survivor.lifesaverUsedThisTurn = false;
    survivor.jumpUsedThisTurn = false;
    survivor.shoveUsedThisTurn = false;
    survivor.hitAndRunFreeMove = false;
    survivor.kidSlipperyUsedThisTurn = false;
    survivor.luckyUsedThisAction = false;
  }

  public static getDangerLevel(xp: number): DangerLevel {
    if (xp >= XP_THRESHOLDS[DangerLevel.Red]) return DangerLevel.Red;
    if (xp >= XP_THRESHOLDS[DangerLevel.Orange]) return DangerLevel.Orange;
    if (xp >= XP_THRESHOLDS[DangerLevel.Yellow]) return DangerLevel.Yellow;
    return DangerLevel.Blue;
  }
}
