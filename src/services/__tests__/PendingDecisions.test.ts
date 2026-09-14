import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GamePhase, GameResult, GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie, withTwoPlayers } from './gridFixture';
import { makeCard, makeSurvivor } from './winConditionHelpers';

/** p2 is the last player of round 1; s1 (host p1) and s2 (p2) share zone a with walkers. */
function roundEndBoard(walkers: number, s1Zone = 'a'): GameState {
  const zombies: GameState['zombies'] = {};
  for (let i = 1; i <= walkers; i++) zombies[`w${i}`] = makeZombie(`w${i}`, ZombieType.Walker, 'a');
  const state = withTwoPlayers(makeGridState(
    { rows: ['a b'] },
    {
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: s1Zone, actionsRemaining: 0 }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'a' }),
      },
      zombies,
    },
  ));
  state.activePlayerIndex = 1;
  state.zones.a.noiseTokens = 1;
  state.noiseTokens = 1;
  return state;
}

function endRound1(state: GameState): GameState {
  const res = processAction(state, { playerId: 'p2', survivorId: 's2', type: ActionType.END_TURN });
  expect(res.success).toBe(true);
  return res.newState!;
}

const distribute = (state: GameState, playerId: string, assignments: Record<string, number>) =>
  processAction(state, {
    playerId, type: ActionType.DISTRIBUTE_ZOMBIE_WOUNDS, payload: { zoneId: 'a', assignments },
  });

describe('Pending wound decisions', () => {
  it('pauses the round until the host distributes, then runs the End Phase', () => {
    const paused = endRound1(roundEndBoard(2));
    expect(paused.phase).toBe(GamePhase.Zombies);
    expect(paused.turn).toBe(1);
    expect(paused.pendingZombieWounds).toHaveLength(1);

    const res = distribute(paused, 'p1', { s1: 2, s2: 0 });
    expect(res.success).toBe(true);
    const next = res.newState!;
    expect(next.phase).toBe(GamePhase.Players);
    expect(next.turn).toBe(2);
    expect(next.zones.a.noiseTokens).toBe(0);
    expect(next.survivors.s1.wounds).toBe(2);
    expect(next.survivors.s1.actionsRemaining).toBe(3);
    expect(next.firstPlayerTokenIndex).toBe(1);
    expect(next.activePlayerIndex).toBe(1);
  });

  it('rejects distribution from a non-host player', () => {
    const paused = endRound1(roundEndBoard(2));
    const res = distribute(paused, 'p2', { s1: 1, s2: 1 });
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('host');
  });

  it('rejects game actions while wounds are pending', () => {
    const paused = endRound1(roundEndBoard(2));
    const res = processAction(paused, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'b' },
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('PENDING_WOUNDS');
  });

  it('Medic heals wounds distributed before the End Phase', () => {
    const state = roundEndBoard(2);
    state.survivors.s1.skills = ['medic'];
    const res = distribute(endRound1(state), 'p1', { s1: 0, s2: 2 });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s2.wounds).toBe(1);
  });

  it('a distribution that kills a survivor ends the game in defeat', () => {
    const res = distribute(endRound1(roundEndBoard(3)), 'p1', { s1: 0, s2: 3 });
    expect(res.success).toBe(true);
    expect(res.newState!.phase).toBe(GamePhase.GameOver);
    expect(res.newState!.gameResult).toBe(GameResult.Defeat);
  });

  it('"Is That All You\'ve Got?" is resolved by the owner out of turn, and only then does the round end', () => {
    const state = roundEndBoard(1, 'b');
    state.survivors.s2.skills = ['is_that_all_youve_got'];
    state.survivors.s2.inventory = [makeCard({ equipmentId: 'pan' })];

    const paused = endRound1(state);
    expect(paused.phase).toBe(GamePhase.Zombies);
    expect(paused.survivors.s2.pendingWounds).toBe(1);

    const byOther = processAction(paused, {
      playerId: 'p1', survivorId: 's2', type: ActionType.RESOLVE_WOUNDS, payload: { discardCardIds: [] },
    });
    expect(byOther.success).toBe(false);

    const res = processAction(paused, {
      playerId: 'p2', survivorId: 's2', type: ActionType.RESOLVE_WOUNDS,
      payload: { discardCardIds: [paused.survivors.s2.inventory[0].id] },
    });
    expect(res.success).toBe(true);
    const next = res.newState!;
    expect(next.survivors.s2.wounds).toBe(0);
    expect(next.phase).toBe(GamePhase.Players);
    expect(next.turn).toBe(2);
    expect(next.activePlayerIndex).toBe(next.firstPlayerTokenIndex);
  });

  it('mid-turn resolution does not advance the active player', () => {
    const state = roundEndBoard(0);
    state.activePlayerIndex = 0;
    state.survivors.s1.actionsRemaining = 2;
    state.pendingZombieWounds = [{ zoneId: 'a', totalWounds: 1, survivorIds: ['s1', 's2'] }];

    const res = distribute(state, 'p1', { s1: 0, s2: 1 });
    expect(res.success).toBe(true);
    expect(res.newState!.phase).toBe(GamePhase.Players);
    expect(res.newState!.activePlayerIndex).toBe(0);
    expect(res.newState!.turn).toBe(1);
  });
});
