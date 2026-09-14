import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { XPManager } from '../XPManager';
import { handleStartGame } from '../handlers/LobbyHandlers';
import { ActionType } from '../../types/Action';
import { DangerLevel, GameState, initialGameState } from '../../types/GameState';
import { makeState, makeSurvivor } from './winConditionHelpers';
import { withTwoPlayers } from './gridFixture';

function amy(experience: number, skills: string[]) {
  const survivor = makeSurvivor({ id: 's2', playerId: 'p2', experience, dangerLevel: XPManager.getDangerLevel(experience) });
  survivor.characterClass = 'Amy';
  survivor.skills = ['plus_1_free_move', ...skills];
  return survivor;
}

function stateWithAmy(experience: number, skills: string[] = ['plus_1_action']): GameState {
  return withTwoPlayers(makeState({
    survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1' }), s2: amy(experience, skills) },
  }));
}

const choose = (state: GameState, playerId: string, skillId: string) =>
  processAction(state, { playerId, survivorId: 's2', type: ActionType.CHOOSE_SKILL, payload: { skillId } });

describe('Pending skill choice', () => {
  it('offers the Orange options on reaching Orange', () => {
    expect(XPManager.getPendingSkillChoice(amy(19, ['plus_1_action']))).toEqual({
      level: DangerLevel.Orange, options: ['medic', 'slippery'],
    });
  });

  it('has no choice once an Orange skill is owned, then offers Red at 43', () => {
    expect(XPManager.getPendingSkillChoice(amy(30, ['plus_1_action', 'medic']))).toBeNull();
    expect(XPManager.getPendingSkillChoice(amy(43, ['plus_1_action', 'medic']))?.level).toBe(DangerLevel.Red);
  });

  it('offers Orange before Red when both are unpicked', () => {
    expect(XPManager.getPendingSkillChoice(amy(43, ['plus_1_action']))?.level).toBe(DangerLevel.Orange);
  });

  it('disappears when experience is restored below Orange (Lucky rollback)', () => {
    const leveled = XPManager.addXP(amy(18, ['plus_1_action']), 1);
    expect(XPManager.getPendingSkillChoice(leveled)).not.toBeNull();
    expect(XPManager.getPendingSkillChoice(amy(18, ['plus_1_action']))).toBeNull();
  });

  it('accepts the owner choice out of turn at no action cost', () => {
    const state = stateWithAmy(19);
    const res = choose(state, 'p2', 'slippery');
    expect(res.success).toBe(true);
    const next = res.newState!;
    expect(next.survivors.s2.skills).toContain('slippery');
    expect(next.survivors.s2.actionsRemaining).toBe(3);
    expect(next.activePlayerIndex).toBe(0);
  });

  it('rejects a choice from a non-owner', () => {
    const res = choose(stateWithAmy(19), 'p1', 'slippery');
    expect(res.success).toBe(false);
  });

  it('rejects a skill that is not offered', () => {
    const res = choose(stateWithAmy(19), 'p2', 'lucky');
    expect(res.success).toBe(false);
  });

  it('applies free action skills immediately', () => {
    const survivor = amy(0, []);
    expect(XPManager.unlockSkill({ ...survivor, skills: [] }, 'plus_1_free_move').freeMovesRemaining).toBe(1);

    const res = choose(stateWithAmy(43, ['plus_1_action', 'medic']), 'p2', 'plus_1_free_combat');
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s2.freeCombatsRemaining).toBe(1);
  });
});

describe('Per-turn reset at game start', () => {
  it('gives Amy her free Move in round 1', () => {
    const lobby = structuredClone(initialGameState) as GameState;
    lobby.lobby.players = [{ id: 'p1', name: 'P1', ready: true, characterClass: 'Amy' } as any];
    const started = handleStartGame(lobby, { playerId: 'p1', type: ActionType.START_GAME });
    expect(started.survivors['survivor-p1'].freeMovesRemaining).toBe(1);
  });
});
