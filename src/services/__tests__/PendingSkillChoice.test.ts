import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { DangerLevel, GameState } from '../../types/GameState';
import { makeGridState, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';
import { es } from '../../strings/es';

/** Orange is 19 XP; Wanda's Orange row is a choice between two skills. */
function boardWithPendingChoice(): GameState {
  const state = makeGridState(
    { rows: ['a b c'] },
    {
      survivors: {
        s1: makeSurvivor({
          id: 's1', playerId: 'p1', zoneId: 'a',
          experience: 19, dangerLevel: DangerLevel.Orange,
        }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'c' }),
      },
    },
  );
  return withTwoPlayers(state);
}

describe('A survivor owing a skill choice cannot act (D10)', () => {
  it('rejects a game action until the choice is made', () => {
    const res = processAction(boardWithPendingChoice(), {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'b' },
    });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('PENDING_SKILL_CHOICE');
    expect(res.error?.message).toBe(es.errors.pendingSkillChoice);
  });

  it('lets the choice itself through, and the survivor acts afterwards', () => {
    const chosen = processAction(boardWithPendingChoice(), {
      playerId: 'p1', survivorId: 's1', type: ActionType.CHOOSE_SKILL,
      payload: { skillId: 'slippery' },
    });
    expect(chosen.success).toBe(true);

    const moved = processAction(chosen.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'b' },
    });
    expect(moved.success).toBe(true);
  });

  it('leaves the other players alone', () => {
    const state = boardWithPendingChoice();
    state.activePlayerIndex = 1;

    const res = processAction(state, {
      playerId: 'p2', survivorId: 's2', type: ActionType.MOVE, payload: { targetZoneId: 'b' },
    });

    expect(res.success).toBe(true);
  });
});
