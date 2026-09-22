import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { XPManager } from '../XPManager';
import { handleStartGame } from '../handlers/LobbyHandlers';
import { ActionType } from '../../types/Action';
import { DangerLevel, GameState, Survivor, ZombieType, initialGameState } from '../../types/GameState';
import { makeState, makeSurvivor } from './winConditionHelpers';
import { withTwoPlayers, makeGridState, makeZombie, makeWeapon } from './gridFixture';
import { skillCount } from '../../config/SkillRegistry';

// Amy's official tree: +1 Free Move (Blue), +1 Action (Yellow),
// [+1 Free Melee | +1 Free Ranged] (Orange), [+1 Die: Combat | +1 to Dice Roll:
// Combat | Medic] (Red).
function amy(experience: number, chosen: Partial<Record<DangerLevel, string>> = {}) {
  const survivor = makeSurvivor({
    id: 's2', playerId: 'p2', experience,
    characterClass: 'Amy', dangerLevel: XPManager.getDangerLevel(experience),
  });
  survivor.skills = ['plus_1_free_move', ...(experience >= 7 ? ['plus_1_action'] : []), ...Object.values(chosen)];
  survivor.skillChoices = chosen;
  return survivor;
}

function stateWithAmy(experience: number, chosen: Partial<Record<DangerLevel, string>> = {}): GameState {
  return withTwoPlayers(makeState({
    survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1' }), s2: amy(experience, chosen) },
  }));
}

const choose = (state: GameState, playerId: string, skillId: string) =>
  processAction(state, { playerId, survivorId: 's2', type: ActionType.CHOOSE_SKILL, payload: { skillId } });

const ORANGE_TAKEN = { [DangerLevel.Orange]: 'plus_1_free_melee' };

describe('Pending skill choice', () => {
  it('offers the Orange options on reaching Orange', () => {
    expect(XPManager.getPendingSkillChoice(amy(19))).toEqual({
      level: DangerLevel.Orange, options: ['plus_1_free_melee', 'plus_1_free_ranged'],
    });
  });

  it('has no choice once Orange is taken, then offers Red at 43', () => {
    expect(XPManager.getPendingSkillChoice(amy(30, ORANGE_TAKEN))).toBeNull();
    expect(XPManager.getPendingSkillChoice(amy(43, ORANGE_TAKEN))?.level).toBe(DangerLevel.Red);
  });

  it('offers Orange before Red when both are unpicked', () => {
    expect(XPManager.getPendingSkillChoice(amy(43))?.level).toBe(DangerLevel.Orange);
  });

  it('still offers the level when the card repeats a skill the survivor owns', () => {
    // Odin's Red repeats his Blue +1 Die: Melee; the level is closed by the
    // recorded choice, not by owning one of the options.
    const odin = makeSurvivor({
      id: 's3', characterClass: 'Odin', experience: 43,
      dangerLevel: DangerLevel.Red, skills: ['plus_1_die_melee', 'plus_1_action', 'plus_1_free_move'],
    });
    odin.skillChoices = { [DangerLevel.Orange]: 'plus_1_free_move' };

    expect(XPManager.getPendingSkillChoice(odin)?.level).toBe(DangerLevel.Red);
    expect(XPManager.chooseSkill(odin, 'plus_1_die_melee').skillChoices[DangerLevel.Red])
      .toBe('plus_1_die_melee');
  });

  it('disappears when experience is restored below Orange (Lucky rollback)', () => {
    const leveled = XPManager.addXP(amy(18), 1);
    expect(XPManager.getPendingSkillChoice(leveled)).not.toBeNull();
    expect(XPManager.getPendingSkillChoice(amy(18))).toBeNull();
  });

  it('accepts the owner choice out of turn at no action cost', () => {
    const res = choose(stateWithAmy(19), 'p2', 'plus_1_free_ranged');
    expect(res.success).toBe(true);
    const next = res.newState!;
    expect(next.survivors.s2.skills).toContain('plus_1_free_ranged');
    expect(next.survivors.s2.actionsRemaining).toBe(3);
    expect(next.activePlayerIndex).toBe(0);
  });

  it('rejects a choice from a non-owner', () => {
    expect(choose(stateWithAmy(19), 'p1', 'plus_1_free_ranged').success).toBe(false);
  });

  it('rejects a skill that is not offered', () => {
    expect(choose(stateWithAmy(19), 'p2', 'lucky').success).toBe(false);
  });

  it('applies free action skills immediately', () => {
    const survivor = amy(0);
    expect(XPManager.unlockSkill({ ...survivor, skills: [] }, 'plus_1_free_move').freeMovesRemaining).toBe(1);

    const res = choose(stateWithAmy(43, ORANGE_TAKEN), 'p2', 'medic');
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s2.skills).toContain('medic');
  });
});

describe('Per-turn reset at game start', () => {
  it('gives Amy her free Move in round 1', () => {
    const lobby = structuredClone(initialGameState) as GameState;
    lobby.lobby.players = [{ id: 'p1', name: 'P1', ready: true, characterClass: 'Amy', startingWeapon: 'pistol' } as any];
    const started = handleStartGame(lobby, { playerId: 'p1', type: ActionType.START_GAME });
    expect(started.survivors['survivor-p1'].freeMovesRemaining).toBe(1);
  });
});

describe('A repeated skill stacks (Odin)', () => {
  // Odin's ID card lists +1 Die: Melee at Blue and again among his three Red
  // options. Numeric skills stack, so taking it twice is +2 dice, not a wasted
  // pick — the rulebook's only non-stacking cases are damage per success and a
  // second Flashlight, both called out as exceptions.
  function odinAtRed() {
    const survivor = makeSurvivor({
      id: 's2', playerId: 'p2', characterClass: 'Odin',
      experience: 43, dangerLevel: DangerLevel.Red,
      skills: ['plus_1_die_melee', 'plus_1_action', 'plus_1_free_move'],
    });
    survivor.skillChoices = { [DangerLevel.Orange]: 'plus_1_free_move' };
    return survivor;
  }

  it('grants a second copy rather than doing nothing', () => {
    const after = XPManager.chooseSkill(odinAtRed(), 'plus_1_die_melee');

    expect(after.skills.filter(s => s === 'plus_1_die_melee')).toHaveLength(2);
    expect(skillCount(after.skills, 'plus_1_die_melee')).toBe(2);
    expect(XPManager.getPendingSkillChoice(after)).toBeNull();
  });

  it('rolls one extra melee die per copy', () => {
    // Both have taken their Red choice, so neither is blocked by the pending
    // gate: one took the melee repeat, the other the ranged option.
    const stacked = XPManager.chooseSkill(odinAtRed(), 'plus_1_die_melee');
    const single = XPManager.chooseSkill(odinAtRed(), 'plus_1_die_ranged');

    const attack = (survivor: Survivor) => {
      const state = withTwoPlayers(makeGridState(
        { rows: ['a b'] },
        {
          survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'b' }), s2: survivor },
          zombies: { w1: makeZombie('w1', ZombieType.Walker, 'a') },
        },
      ));
      state.activePlayerIndex = 1;
      state.survivors.s2.position.zoneId = 'a';
      state.survivors.s2.inventory = [makeWeapon('bat', { dice: 2, accuracy: 6 })];

      return processAction(state, {
        playerId: 'p2', survivorId: 's2', type: ActionType.ATTACK,
        payload: { targetZoneId: 'a', weaponId: 'bat' },
      });
    };

    const one = attack(single);
    const two = attack(stacked);

    expect(one.success).toBe(true);
    expect(two.success).toBe(true);
    // Weapon 2 dice + 1 copy = 3; + 2 copies = 4.
    expect(one.newState!.lastAction?.dice).toHaveLength(3);
    expect(two.newState!.lastAction?.dice).toHaveLength(4);
  });
});
