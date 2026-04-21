import { describe, it, expect } from 'vitest';
import { DangerLevel, Survivor } from '../../types/GameState';
import {
  SKILL_DEFINITIONS, SURVIVOR_CLASSES,
} from '../../config/SkillRegistry';
import { XPManager } from '../XPManager';

// B11 — Reaper (reaper_combat/reaper_melee) is not in Z2E core box and must be
// fully absent from the skill registry and all character progressions.

function blankSurvivor(characterClass: string): Survivor {
  return {
    id: 'lvl-test',
    playerId: 'p1',
    name: 'Tester',
    characterClass,
    position: { x: 0, y: 0, zoneId: 'z1' },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: [],
    inventory: [],
    actionsRemaining: 3,
    hasMoved: false,
    hasSearched: false,
    freeMovesRemaining: 0,
    freeSearchesRemaining: 0,
    freeCombatsRemaining: 0,
    freeMeleeRemaining: 0,
    freeRangedRemaining: 0,
    toughUsedZombieAttack: false,
    toughUsedFriendlyFire: false,
    sprintUsedThisTurn: false,
    chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
  };
}

describe('B11 — Reaper skills fully removed from registry and class progressions', () => {
  it('SKILL_DEFINITIONS has no reaper_* key', () => {
    for (const key of Object.keys(SKILL_DEFINITIONS)) {
      expect(key).not.toMatch(/reaper/i);
    }
  });

  it('no character progression references reaper_combat or reaper_melee', () => {
    for (const [cls, progression] of Object.entries(SURVIVOR_CLASSES)) {
      const all = [
        ...progression[DangerLevel.Blue],
        ...progression[DangerLevel.Yellow],
        ...progression[DangerLevel.Orange],
        ...progression[DangerLevel.Red],
      ];
      for (const skill of all) {
        expect(skill, `${cls} has reaper skill ${skill}`).not.toMatch(/reaper/i);
      }
    }
  });

  it('every skill in every character progression resolves to a SKILL_DEFINITIONS entry', () => {
    for (const [cls, progression] of Object.entries(SURVIVOR_CLASSES)) {
      const all = [
        ...progression[DangerLevel.Blue],
        ...progression[DangerLevel.Yellow],
        ...progression[DangerLevel.Orange],
        ...progression[DangerLevel.Red],
      ];
      for (const skill of all) {
        expect(
          SKILL_DEFINITIONS[skill],
          `${cls} references unknown skill "${skill}"`,
        ).toBeDefined();
      }
    }
  });

  it('every character reaches Red level via XPManager.addXP without throwing', () => {
    for (const characterClass of Object.keys(SURVIVOR_CLASSES)) {
      let s = blankSurvivor(characterClass);
      // Walk through enough XP to trigger every auto-unlock the manager handles.
      // Orange/Red require an explicit choice, so just confirm level transitions
      // do not crash and Blue/Yellow auto-skills are valid.
      expect(() => {
        s = XPManager.addXP(s, 7);   // Yellow threshold
        s = XPManager.addXP(s, 12);  // Orange threshold (19 total)
        s = XPManager.addXP(s, 24);  // Red threshold (43 total)
      }, `level-up crashed for ${characterClass}`).not.toThrow();

      expect(s.dangerLevel).toBe(DangerLevel.Red);
      // Every auto-unlocked skill must be a valid core-box skill.
      for (const sk of s.skills) {
        expect(SKILL_DEFINITIONS[sk], `${characterClass} auto-unlocked unknown skill "${sk}"`).toBeDefined();
      }
    }
  });
});
